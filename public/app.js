let db;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
    } else {
        alert("Firebase não foi carregado.");
        return;
    }

    await carregarClientesLogin();

    document.getElementById('btn-login').addEventListener('click', () => {
        const select = document.getElementById('client-select');
        if (select.value) {
            login(select.value, select.options[select.selectedIndex].text);
        } else {
            alert('Por favor, selecione seu nome.');
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('portal-section').style.display = 'none';
        currentUser = null;
    });
});

async function carregarClientesLogin() {
    try {
        const snapshot = await db.collection("clientes").get();
        const select = document.getElementById('client-select');
        select.innerHTML = '<option value="">Selecione seu nome...</option>';
        snapshot.forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.textContent = doc.data().nome;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Erro ao carregar clientes:', e);
        document.getElementById('client-select').innerHTML = '<option value="">Erro ao conectar na Nuvem</option>';
    }
}

async function login(clienteId, nome) {
    try {
        const docRef = await db.collection("clientes").doc(clienteId).get();
        if (docRef.exists) {
            currentUser = { id: docRef.id, ...docRef.data() };
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('portal-section').style.display = 'block';
            await carregarConfiguracoes();
            atualizarPainelCliente();
        }
    } catch (e) {
        alert('Erro ao fazer login.');
    }
}

async function atualizarPainelCliente() {
    // Refresh user data
    const docRef = await db.collection("clientes").doc(currentUser.id).get();
    currentUser = { id: docRef.id, ...docRef.data() };

    document.getElementById('user-name').textContent = currentUser.nome;
    document.getElementById('user-points').innerHTML = `${currentUser.pontos} <span style="font-size: 20px; font-weight: normal;">Pontos</span>`;

    // Carregar Extrato
    const snapTransacoes = await db.collection("transacoes").where("clienteId", "==", currentUser.id).get();
    let extrato = [];
    snapTransacoes.forEach(d => extrato.push(d.data()));
    extrato.sort((a,b) => new Date(b.dataTransacao) - new Date(a.dataTransacao)); // desc
    
    const listExt = document.getElementById('extrato-list');
    listExt.innerHTML = '';
    extrato.forEach(t => {
        const li = document.createElement('li');
        li.className = 'history-item';
        const isPos = t.pontos > 0;
        const ptsClass = isPos ? 'pts-positive' : 'pts-negative';
        const ptsSignal = isPos ? '+' : '';
        const dataStr = new Date(t.dataTransacao).toLocaleDateString('pt-BR');
        
        li.innerHTML = `
            <div>
                <p style="font-weight: 500;">${t.descricao}</p>
                <p style="font-size: 12px; color: var(--text-secondary);">${dataStr}</p>
            </div>
            <div class="${ptsClass}">${ptsSignal}${t.pontos}</div>
        `;
        listExt.appendChild(li);
    });

    // Carregar Cupons
    const snapCupons = await db.collection("cupons").where("clienteId", "==", currentUser.id).get();
    let cupons = [];
    snapCupons.forEach(d => cupons.push(d.data()));
    cupons.sort((a,b) => new Date(b.dataResgate) - new Date(a.dataResgate));

    const listCupom = document.getElementById('cupons-list');
    listCupom.innerHTML = '';
    if (cupons.length === 0) {
        document.getElementById('cupons-empty').style.display = 'block';
    } else {
        document.getElementById('cupons-empty').style.display = 'none';
        cupons.forEach(c => {
            const li = document.createElement('li');
            li.className = 'history-item';
            const dataStr = new Date(c.dataResgate).toLocaleDateString('pt-BR');
            li.innerHTML = `
                <div>
                    <p style="font-weight: bold; color: var(--primary-color); font-size: 18px;">${c.codigo}</p>
                    <p style="font-size: 12px; color: var(--text-secondary);">Gerado em ${dataStr}</p>
                </div>
                <div style="font-weight: 600;">${c.descontoPercentual}% OFF</div>
            `;
            listCupom.appendChild(li);
        });
    }

    // Carregar Agenda
    const snapAgenda = await db.collection("agendamentos").where("clienteId", "==", currentUser.id).where("status", "==", "PENDENTE").get();
    let agenda = [];
    snapAgenda.forEach(d => agenda.push(d.data()));
    agenda.sort((a,b) => new Date(a.dataHora) - new Date(b.dataHora));

    const listAgenda = document.getElementById('agenda-list');
    listAgenda.innerHTML = '';
    
    if (agenda.length === 0) {
        document.getElementById('agenda-empty').style.display = 'block';
    } else {
        document.getElementById('agenda-empty').style.display = 'none';
        agenda.forEach(a => {
            const li = document.createElement('li');
            li.className = 'history-item';
            const dateObj = new Date(a.dataHora);
            const dataStr = dateObj.toLocaleDateString('pt-BR');
            const horaStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `
                <div>
                    <p style="font-weight: 500; font-size: 16px;">${a.servicoNome}</p>
                    <p style="font-size: 14px; color: var(--text-secondary);"><i class="ph ph-calendar"></i> ${dataStr} às ${horaStr}</p>
                </div>
                <div style="display: flex; align-items: center; color: var(--primary-color); font-weight: 600;">
                    +10 pts
                </div>
            `;
            listAgenda.appendChild(li);
        });
    }
}

let configCache = {
    cupom1: { percentual: 10, pontos: 50 },
    cupom2: { percentual: 20, pontos: 100 }
};

async function carregarConfiguracoes() {
    try {
        const doc = await db.collection("configuracoes").doc("recompensas").get();
        if (doc.exists) {
            configCache = doc.data();
            localStorage.setItem('cliniSync_config_cache', JSON.stringify(configCache));
        }
    } catch(e) {
        console.error("Erro ao carregar do Firebase. Tentando LocalStorage...", e);
        
        // Se a busca no Firebase falhar, recupera o que estava salvo no navegador
        const cacheSalvo = localStorage.getItem('cliniSync_config_cache');
        if (cacheSalvo) {
            configCache = JSON.parse(cacheSalvo);
            console.log("Configurações carregadas do LocalStorage com sucesso!");
        }
    }
        
    const container = document.getElementById('rewards-container');
    container.innerHTML = `
        <div class="reward-card">
            <i class="ph-duotone ph-ticket" style="font-size: 40px; color: var(--primary-color);"></i>
            <h3>${configCache.cupom1.percentual}% OFF</h3>
            <p style="color: var(--text-secondary); margin-bottom: 15px;">Em qualquer procedimento</p>
            <button class="btn-primary w-100" onclick="resgatarCupom(${configCache.cupom1.percentual}, ${configCache.cupom1.pontos})" style="width: 100%; justify-content: center;">Resgatar por ${configCache.cupom1.pontos} pts</button>
        </div>
        <div class="reward-card">
            <i class="ph-duotone ph-ticket" style="font-size: 40px; color: var(--primary-color);"></i>
            <h3>${configCache.cupom2.percentual}% OFF</h3>
            <p style="color: var(--text-secondary); margin-bottom: 15px;">Em qualquer procedimento</p>
            <button class="btn-primary w-100" onclick="resgatarCupom(${configCache.cupom2.percentual}, ${configCache.cupom2.pontos})" style="width: 100%; justify-content: center;">Resgatar por ${configCache.cupom2.pontos} pts</button>
        </div>
    `;
}

async function resgatarCupom(desconto, custo) {
    if (!currentUser) return;
    
    if (currentUser.pontos < custo) {
        alert(`Você precisa de ${custo} pontos para resgatar este cupom.`);
        return;
    }

    if (confirm(`Deseja trocar ${custo} pontos por um cupom de ${desconto}% OFF?`)) {
        try {
            // Deduct points
            const newPoints = currentUser.pontos - custo;
            await db.collection("clientes").doc(currentUser.id).update({ pontos: newPoints });

            // Transacao
            await db.collection("transacoes").add({
                clienteId: currentUser.id,
                pontos: -custo,
                descricao: `Resgate de Cupom ${desconto}%`,
                dataTransacao: new Date().toISOString()
            });

            // Cupom
            const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
            await db.collection("cupons").add({
                clienteId: currentUser.id,
                codigo: `CS-${hash}`,
                descontoPercentual: desconto,
                dataResgate: new Date().toISOString(),
                utilizado: false
            });

            alert('Cupom resgatado com sucesso!');
            atualizarPainelCliente();
        } catch (e) {
            alert('Erro ao resgatar cupom na nuvem.');
            console.error(e);
        }
    }
}
