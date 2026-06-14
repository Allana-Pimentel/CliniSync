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

    // Admin Access Logic
    const adminBtn = document.getElementById('btn-admin-access');
    const adminOverlay = document.getElementById('admin-login-overlay');
    const adminCancel = document.getElementById('btn-cancel-admin');
    const adminConfirm = document.getElementById('btn-confirm-admin');
    const adminError = document.getElementById('admin-login-error');

    if(adminBtn) {
        adminBtn.addEventListener('click', () => {
            adminOverlay.style.display = 'flex';
            document.getElementById('admin-user').value = '';
            document.getElementById('admin-pass').value = '';
            adminError.style.display = 'none';
        });
    }

    if(adminCancel) {
        adminCancel.addEventListener('click', () => {
            adminOverlay.style.display = 'none';
        });
    }

    if(adminConfirm) {
        adminConfirm.addEventListener('click', () => {
            const user = document.getElementById('admin-user').value;
            const pass = document.getElementById('admin-pass').value;
            
            if (user === 'admin' && pass === 'admin') {
                window.location.href = 'admin.html';
            } else {
                adminError.style.display = 'block';
            }
        });
    }
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

let recompensasCache = [];

async function carregarConfiguracoes() {
    try {
        const snapshot = await db.collection("recompensas").get();
        recompensasCache = [];
        snapshot.forEach(doc => recompensasCache.push({ id: doc.id, ...doc.data() }));
        
        // Fallback: if no rewards in new collection, try old config format
        if (recompensasCache.length === 0) {
            const configDoc = await db.collection("configuracoes").doc("recompensas").get();
            if (configDoc.exists) {
                const data = configDoc.data();
                if (data.cupom1) {
                    recompensasCache.push({
                        nome: `Cupom ${data.cupom1.percentual}% OFF`,
                        descricao: "Em qualquer procedimento",
                        tipo: "desconto",
                        valor: data.cupom1.percentual,
                        custoPontos: data.cupom1.pontos
                    });
                }
                if (data.cupom2) {
                    recompensasCache.push({
                        nome: `Cupom ${data.cupom2.percentual}% OFF`,
                        descricao: "Em qualquer procedimento",
                        tipo: "desconto",
                        valor: data.cupom2.percentual,
                        custoPontos: data.cupom2.pontos
                    });
                }
            }
        }

        localStorage.setItem('cliniSync_recompensas_cache', JSON.stringify(recompensasCache));
    } catch(e) {
        console.error("Erro ao carregar recompensas. Tentando LocalStorage...", e);
        const cacheSalvo = localStorage.getItem('cliniSync_recompensas_cache');
        if (cacheSalvo) {
            recompensasCache = JSON.parse(cacheSalvo);
        }
    }
        
    const container = document.getElementById('rewards-container');
    container.innerHTML = '';

    if (recompensasCache.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center;">Nenhuma recompensa disponível no momento.</p>';
        return;
    }

    // Lógica de Aniversário
    if (currentUser && currentUser.aniversario) {
        const [year, month, day] = currentUser.aniversario.split('-');
        const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
        if (month === currentMonth) {
            container.innerHTML += `
                <div class="reward-card" style="border: 2px solid var(--primary-color); background: rgba(14, 165, 233, 0.05); position: relative;">
                    <div style="position: absolute; top: -12px; right: 20px; background: var(--primary-color); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.3);">Mês do seu Aniversário! 🎉</div>
                    <i class="ph-duotone ph-cake" style="font-size: 40px; color: var(--primary-color);"></i>
                    <h3>Presente Especial</h3>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 15px;">20% OFF em qualquer procedimento!</p>
                    <button class="btn-primary" style="width: 100%; justify-content: center;" onclick="alert('Mostre esta tela na recepção para resgatar seu presente de aniversário!')">Resgatar Presente</button>
                </div>
            `;
        }
    }

    recompensasCache.forEach((r, index) => {
        const isDesconto = r.tipo === 'desconto';
        const valorLabel = isDesconto ? `${r.valor}% OFF` : `R$ ${Number(r.valor).toFixed(2)}`;
        const iconName = isDesconto ? 'ph-ticket' : 'ph-gift';

        container.innerHTML += `
            <div class="reward-card">
                <i class="ph-duotone ${iconName}" style="font-size: 40px; color: var(--primary-color);"></i>
                <h3>${valorLabel}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 5px; font-weight: 500; font-size: 14px;">${r.nome}</p>
                <p style="color: var(--text-secondary); margin-bottom: 15px; font-size: 13px;">${r.descricao || ''}</p>
                <button class="btn-primary w-100" onclick="resgatarCupom(${index})" style="width: 100%; justify-content: center;">Resgatar por ${r.custoPontos} pts</button>
            </div>
        `;
    });
}

async function resgatarCupom(index) {
    if (!currentUser) return;
    
    const r = recompensasCache[index];
    if (!r) return;

    const custo = r.custoPontos;
    const isDesconto = r.tipo === 'desconto';
    const valorLabel = isDesconto ? `${r.valor}% OFF` : `R$ ${Number(r.valor).toFixed(2)}`;
    
    if (currentUser.pontos < custo) {
        alert(`Você precisa de ${custo} pontos para resgatar "${r.nome}".`);
        return;
    }

    if (confirm(`Deseja trocar ${custo} pontos por "${r.nome}" (${valorLabel})?`)) {
        try {
            // Deduct points
            const newPoints = currentUser.pontos - custo;
            await db.collection("clientes").doc(currentUser.id).update({ pontos: newPoints });

            // Transação
            await db.collection("transacoes").add({
                clienteId: currentUser.id,
                pontos: -custo,
                descricao: `Resgate: ${r.nome} (${valorLabel})`,
                dataTransacao: new Date().toISOString()
            });

            // Cupom
            const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
            await db.collection("cupons").add({
                clienteId: currentUser.id,
                codigo: `CS-${hash}`,
                descontoPercentual: isDesconto ? r.valor : 0,
                bonusValor: !isDesconto ? r.valor : 0,
                nomeRecompensa: r.nome,
                tipo: r.tipo,
                dataResgate: new Date().toISOString(),
                utilizado: false
            });

            alert('Recompensa resgatada com sucesso!');
            atualizarPainelCliente();
        } catch (e) {
            alert('Erro ao resgatar recompensa na nuvem.');
            console.error(e);
        }
    }
}

