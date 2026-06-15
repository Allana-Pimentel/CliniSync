let db;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
    } else {
        alert("Firebase não foi carregado.");
        return;
    }

    // Inicializar Tema
    const savedTheme = localStorage.getItem('theme');
    const globalToggle = document.getElementById('global-theme-toggle');
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (globalToggle) globalToggle.checked = savedTheme === 'dark';
    }

    if (globalToggle) {
        globalToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            const themeToSet = isDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', themeToSet);
            localStorage.setItem('theme', themeToSet);
        });
    }

    document.getElementById('btn-login').addEventListener('click', () => {
        const loginStr = document.getElementById('client-login-input').value.trim();
        const pass = document.getElementById('client-pass').value;
        if (loginStr) {
            login(loginStr, pass);
        } else {
            alert('Por favor, digite seu CPF ou Telefone.');
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('portal-section').style.display = 'none';
        currentUser = null;
        document.getElementById('client-pass').value = '';
    });

    // Settings Modal
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('settings-name').value = currentUser.nome || '';
        document.getElementById('settings-telefone').value = currentUser.telefone || '';
        document.getElementById('settings-email').value = currentUser.email || '';
        document.getElementById('settings-pass').value = '';
        document.getElementById('modal-settings').classList.remove('hidden');
    });

    document.getElementById('btn-settings-cancel').addEventListener('click', () => {
        document.getElementById('modal-settings').classList.add('hidden');
    });

    document.getElementById('btn-settings-save').addEventListener('click', async () => {
        if (!currentUser) return;
        const newName = document.getElementById('settings-name').value.trim();
        const newTelefone = document.getElementById('settings-telefone').value.trim();
        const newEmail = document.getElementById('settings-email').value.trim();
        const newPass = document.getElementById('settings-pass').value;
        
        // Update DB
        const updateData = {};
        if (newName) updateData.nome = newName;
        if (newTelefone !== undefined) updateData.telefone = newTelefone;
        if (newEmail !== undefined) updateData.email = newEmail;
        if (newPass) updateData.senha = newPass;

        if (Object.keys(updateData).length > 0) {
            try {
                await db.collection("clientes").doc(currentUser.id).update(updateData);
                currentUser = { ...currentUser, ...updateData };
                document.getElementById('user-name').textContent = currentUser.nome;
                alert('Configurações salvas com sucesso!');
            } catch (e) {
                console.error(e);
                alert('Erro ao atualizar perfil.');
            }
        }
        document.getElementById('modal-settings').classList.add('hidden');
    });
});

async function login(loginIdentifier, passwordInput) {
    try {
        // Query by CPF or Telefone
        let docRef = null;
        let querySnapshot = await db.collection("clientes").where("cpf", "==", loginIdentifier).get();
        
        if (querySnapshot.empty) {
            querySnapshot = await db.collection("clientes").where("telefone", "==", loginIdentifier).get();
        }

        if (!querySnapshot.empty) {
            docRef = querySnapshot.docs[0];
        }

        if (docRef && docRef.exists) {
            const data = docRef.data();
            const expectedPassword = data.senha ? data.senha : "1234";
            if (expectedPassword !== passwordInput) {
                alert('Senha incorreta. A senha padrão inicial é 1234.');
                return;
            }
            currentUser = { id: docRef.id, ...data };
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('portal-section').style.display = 'block';
            await atualizarPainelCliente();
            await carregarConfiguracoes();
        } else {
            alert('Cadastro não encontrado com este CPF ou Telefone.');
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

    // Gamification: Levels & Progress Bar
    const pontos = currentUser.pontos || 0;
    const levels = [
        { name: 'Bronze', min: 0, max: 50, css: 'bronze', icon: '🥉' },
        { name: 'Prata', min: 50, max: 120, css: 'prata', icon: '🥈' },
        { name: 'Ouro', min: 120, max: 250, css: 'ouro', icon: '🥇' },
        { name: 'Diamante', min: 250, max: 9999, css: 'diamante', icon: '💎' }
    ];
    let currentLevel = levels[0];
    let nextLevel = levels[1];
    for (let i = 0; i < levels.length; i++) {
        if (pontos >= levels[i].min) {
            currentLevel = levels[i];
            nextLevel = levels[i + 1] || levels[i];
        }
    }
    currentUser.levelName = currentLevel.name.toLowerCase();
    const badgeEl = document.getElementById('user-level-badge');
    if (badgeEl) {
        badgeEl.innerHTML = `<span class="level-badge ${currentLevel.css}">${currentLevel.icon} ${currentLevel.name}</span>`;
    }
    const progressFill = document.getElementById('progress-fill');
    const progressLabelLevel = document.getElementById('progress-label-level');
    const progressLabelNext = document.getElementById('progress-label-next');
    if (progressFill && progressLabelLevel && progressLabelNext) {
        const range = nextLevel.max - currentLevel.min;
        const progress = Math.min(((pontos - currentLevel.min) / range) * 100, 100);
        progressFill.style.width = progress + '%';
        progressFill.setAttribute('aria-valuenow', Math.round(progress));
        progressLabelLevel.textContent = `${currentLevel.icon} ${currentLevel.name}`;
        if (nextLevel !== currentLevel) {
            progressLabelNext.textContent = `${nextLevel.icon} ${nextLevel.name} (${nextLevel.min} pts)`;
        } else {
            progressLabelNext.textContent = 'Nível máximo!';
        }
    }

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

    recompensasCache.forEach((r, index) => {
        let isBirthdayMonth = false;
        if (currentUser && currentUser.aniversario) {
            const [, month] = currentUser.aniversario.split('-');
            const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
            isBirthdayMonth = (month === currentMonth);
        }

        if (r.isAniversario) {
            if (!isBirthdayMonth) return; // Hide if not their birthday month
        }

        const isDesconto = r.tipo === 'desconto';
        const valorLabel = isDesconto ? `${r.valor}% OFF` : `R$ ${Number(r.valor).toFixed(2)}`;
        const iconName = r.isAniversario ? 'ph-cake' : (isDesconto ? 'ph-ticket' : 'ph-gift');

        // Check level requirement
        const levelsHierarchy = { 'bronze': 0, 'prata': 1, 'ouro': 2, 'diamante': 3 };
        const userLevelScore = levelsHierarchy[currentUser?.levelName] || 0;
        const requiredLevelScore = r.nivelMinimo ? levelsHierarchy[r.nivelMinimo.toLowerCase()] : 0;
        
        let bloqueado = false;
        let btnHtml = '';
        if (requiredLevelScore > userLevelScore) {
            if (r.visivelInferiores === false) return; // Hide completely
            bloqueado = true;
            const nivelNomes = { 'prata': 'Prata', 'ouro': 'Ouro', 'diamante': 'Diamante' };
            const reqNome = nivelNomes[r.nivelMinimo] || r.nivelMinimo;
            btnHtml = `<button class="btn-secondary w-100" style="width: 100%; justify-content: center; opacity: 0.6; cursor: not-allowed;" disabled>Bloqueado (Exige ${reqNome}+)</button>`;
        } else {
            const btnText = r.isAniversario ? 'Resgatar Presente' : `Resgatar (${r.custoPontos} pts)`;
            btnHtml = `<button class="btn-primary w-100" onclick="resgatarCupom('${r.id}')" style="width: 100%; justify-content: center;">${btnText}</button>`;
        }

        const card = document.createElement('div');
        card.className = 'reward-card';
        if (bloqueado) {
            card.style.opacity = '0.7';
            card.style.filter = 'grayscale(100%)';
        }
        
        if (r.isAniversario) {
            card.style.border = '2px solid var(--primary-color)';
            card.style.background = 'rgba(14, 165, 233, 0.05)';
        }

        let badgeHtml = '';
        if (r.isAniversario) {
            badgeHtml = `<div style="position: absolute; top: -12px; right: 20px; background: var(--primary-color); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.3);">Mês do seu Aniversário! 🎉</div>`;
        } else if (r.nivelMinimo) {
            const nivelNomes = { 'prata': 'Prata', 'ouro': 'Ouro', 'diamante': 'Diamante' };
            badgeHtml = `<div class="reward-level-badge level-${r.nivelMinimo}">${nivelNomes[r.nivelMinimo]}</div>`;
        }

        card.innerHTML = `
            ${badgeHtml}
            <i class="ph-duotone ${iconName}" style="font-size: 40px; color: ${bloqueado ? 'var(--text-secondary)' : 'var(--primary-color)'};"></i>
            <h3>${r.nome}</h3>
            <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 15px;">${r.descricao || ''}</p>
            <div style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 20px;">
                ${valorLabel}
            </div>
            ${btnHtml}
        `;
        container.appendChild(card);
    });
}

async function resgatarCupom(id) {
    if (!currentUser) return;
    
    const r = recompensasCache.find(rec => rec.id === id);
    if (!r) return;

    const custo = r.custoPontos;
    const isDesconto = r.tipo === 'desconto';
    const valorLabel = isDesconto ? `${r.valor}% OFF` : `R$ ${Number(r.valor).toFixed(2)}`;
    
    if (currentUser.pontos < custo) {
        alert(`Você precisa de ${custo} pontos para resgatar "${r.nome}".`);
        return;
    }

    const levelsHierarchy = { 'bronze': 0, 'prata': 1, 'ouro': 2, 'diamante': 3 };
    const userLevelScore = levelsHierarchy[currentUser?.levelName] || 0;
    const requiredLevelScore = r.nivelMinimo ? levelsHierarchy[r.nivelMinimo.toLowerCase()] : 0;
    
    if (requiredLevelScore > userLevelScore) {
        alert(`Seu nível não permite resgatar este benefício. Nível mínimo exigido: ${r.nivelMinimo}.`);
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
            await atualizarPainelCliente();
            await carregarConfiguracoes();
        } catch (e) {
            alert('Erro ao resgatar recompensa na nuvem.');
            console.error(e);
        }
    }
}

