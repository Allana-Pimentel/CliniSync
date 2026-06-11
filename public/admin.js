let db;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if firebase is ready
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
    } else {
        alert("Firebase não foi carregado. Certifique-se de acessar via https://clinicsync-af312.web.app ou firebase serve.");
        return;
    }

    initNavigation();
    
    // Create default services if empty
    await checkDefaultServices();
    
    loadDashboard();
    
    // Bind buttons
    document.getElementById('btn-add-cliente').addEventListener('click', () => document.getElementById('modal-cliente').classList.remove('hidden'));
    document.getElementById('btn-cancel-cliente').addEventListener('click', () => document.getElementById('modal-cliente').classList.add('hidden'));
    document.getElementById('btn-save-cliente').addEventListener('click', saveCliente);

    document.getElementById('btn-add-servico').addEventListener('click', () => {
        document.getElementById('servico-id').value = '';
        document.getElementById('servico-nome').value = '';
        document.getElementById('servico-valor').value = '';
        document.getElementById('modal-servico').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-servico').addEventListener('click', () => document.getElementById('modal-servico').classList.add('hidden'));
    document.getElementById('btn-save-servico').addEventListener('click', saveServico);

    document.getElementById('btn-save-config').addEventListener('click', saveConfig);

    document.getElementById('btn-add-agenda').addEventListener('click', () => {
        document.getElementById('modal-agenda').classList.remove('hidden');
        populateSelects();
    });
    document.getElementById('btn-cancel-agenda').addEventListener('click', () => document.getElementById('modal-agenda').classList.add('hidden'));
    document.getElementById('btn-save-agenda').addEventListener('click', saveAgenda);
});

async function checkDefaultServices() {
    const snapshot = await db.collection("servicos").limit(1).get();
    if (snapshot.empty) {
        await db.collection("servicos").add({ nome: "Limpeza", valorPadrao: 150 });
        await db.collection("servicos").add({ nome: "Consulta", valorPadrao: 100 });
        await db.collection("servicos").add({ nome: "Cirurgia", valorPadrao: 500 });
    }
}

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            const viewId = 'view-' + e.currentTarget.getAttribute('data-view');
            document.getElementById(viewId).classList.add('active');

            if (viewId === 'view-clientes') loadClientes();
            if (viewId === 'view-servicos') loadServicos();
            if (viewId === 'view-agenda') loadAgenda();
            if (viewId === 'view-dashboard') loadDashboard();
            if (viewId === 'view-config') loadConfig();
        });
    });
}

// --- Configurações ---
async function loadConfig() {
    try {
        const doc = await db.collection("configuracoes").doc("recompensas").get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('config-cupom1-perc').value = data.cupom1.percentual;
            document.getElementById('config-cupom1-pts').value = data.cupom1.pontos;
            document.getElementById('config-cupom2-perc').value = data.cupom2.percentual;
            document.getElementById('config-cupom2-pts').value = data.cupom2.pontos;
        }
    } catch(e) {
        console.error("Erro ao carregar configurações", e);
    }
}

async function saveConfig() {
    const data = {
        cupom1: {
            percentual: parseInt(document.getElementById('config-cupom1-perc').value),
            pontos: parseInt(document.getElementById('config-cupom1-pts').value)
        },
        cupom2: {
            percentual: parseInt(document.getElementById('config-cupom2-perc').value),
            pontos: parseInt(document.getElementById('config-cupom2-pts').value)
        }
    };
    try {
        await db.collection("configuracoes").doc("recompensas").set(data);
        alert("Configurações salvas com sucesso!");
    } catch(e) {
        alert("Erro ao salvar configurações.");
    }
}

// --- Dashboard ---
async function loadDashboard() {
    const snapshot = await db.collection("clientes").get();
    let clientes = [];
    snapshot.forEach(doc => clientes.push({ id: doc.id, ...doc.data() }));
    
    clientes.sort((a, b) => b.pontos - a.pontos);

    const tbody = document.getElementById('ranking-tbody');
    tbody.innerHTML = '';
    clientes.forEach((c, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${index + 1}</td>
            <td style="font-weight: 600;">${c.nome}</td>
            <td style="color: var(--primary-color); font-weight: bold;">${c.pontos} pts</td>
            <td>
                <button onclick="whatsapp('${c.telefone}')" class="btn-secondary" style="padding: 6px 12px; font-size: 13px; color: #25D366; border-color: #25D366;"><i class="ph ph-whatsapp-logo"></i> Mensagem</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function whatsapp(telefone) {
    if (!telefone) return alert("Cliente sem telefone cadastrado.");
    const numero = telefone.replace(/\D/g, '');
    const url = `https://web.whatsapp.com/send?phone=${numero}&text=Olá! Tudo bem?`;
    window.open(url, '_blank');
}

// --- Clientes ---
async function loadClientes() {
    const snapshot = await db.collection("clientes").get();
    const tbody = document.getElementById('clientes-tbody');
    tbody.innerHTML = '';
    snapshot.forEach(doc => {
        const c = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.nome}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c.pontos}</td>
            <td>
                <button onclick="whatsapp('${c.telefone}')" class="action-btn" title="WhatsApp"><i class="ph ph-whatsapp-logo" style="color: #25D366;"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveCliente() {
    const nome = document.getElementById('cliente-nome').value;
    const telefone = document.getElementById('cliente-telefone').value;
    if (!nome) return alert('Nome é obrigatório');

    try {
        await db.collection("clientes").add({ nome, telefone, pontos: 0 });
        
        document.getElementById('modal-cliente').classList.add('hidden');
        document.getElementById('cliente-nome').value = '';
        document.getElementById('cliente-telefone').value = '';
        loadClientes();
    } catch (error) {
        alert("Erro ao salvar cliente no Firestore.");
        console.error(error);
    }
}

// --- Servicos ---
async function loadServicos() {
    const snapshot = await db.collection("servicos").get();
    const tbody = document.getElementById('servicos-tbody');
    tbody.innerHTML = '';
    snapshot.forEach(doc => {
        const s = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.nome}</td>
            <td>R$ ${Number(s.valorPadrao).toFixed(2)}</td>
            <td>
                <button onclick="editServico('${doc.id}', '${s.nome}', ${s.valorPadrao})" class="action-btn" title="Editar"><i class="ph ph-pencil-simple" style="color: var(--text-primary);"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editServico(id, nome, valorPadrao) {
    document.getElementById('servico-id').value = id;
    document.getElementById('servico-nome').value = nome;
    document.getElementById('servico-valor').value = valorPadrao;
    document.getElementById('modal-servico').classList.remove('hidden');
}

async function saveServico() {
    const id = document.getElementById('servico-id').value;
    const nome = document.getElementById('servico-nome').value;
    const valorPadrao = parseFloat(document.getElementById('servico-valor').value);
    if (!nome || isNaN(valorPadrao)) return alert('Preencha os campos corretamente');

    try {
        if (id) {
            await db.collection("servicos").doc(id).update({ nome, valorPadrao });
        } else {
            await db.collection("servicos").add({ nome, valorPadrao });
        }
        
        document.getElementById('modal-servico').classList.add('hidden');
        document.getElementById('servico-id').value = '';
        document.getElementById('servico-nome').value = '';
        document.getElementById('servico-valor').value = '';
        loadServicos();
    } catch (error) {
        alert("Erro ao salvar serviço.");
    }
}

// --- Agenda ---
async function populateSelects() {
    const selectC = document.getElementById('agenda-cliente');
    const selectS = document.getElementById('agenda-servico');
    selectC.innerHTML = ''; selectS.innerHTML = '';

    const snapC = await db.collection("clientes").get();
    snapC.forEach(doc => {
        selectC.innerHTML += `<option value="${doc.id}" data-nome="${doc.data().nome}" data-telefone="${doc.data().telefone || ''}">${doc.data().nome}</option>`;
    });

    const snapS = await db.collection("servicos").get();
    snapS.forEach(doc => {
        selectS.innerHTML += `<option value="${doc.id}" data-nome="${doc.data().nome}">${doc.data().nome}</option>`;
    });
}

async function loadAgenda() {
    const snapshot = await db.collection("agendamentos").get();
    let agenda = [];
    snapshot.forEach(doc => agenda.push({ id: doc.id, ...doc.data() }));

    const tbody = document.getElementById('agenda-tbody');
    tbody.innerHTML = '';
    
    // sort desc by date
    agenda.sort((a,b) => new Date(a.dataHora) - new Date(b.dataHora));

    agenda.forEach(a => {
        const tr = document.createElement('tr');
        const dataStr = new Date(a.dataHora).toLocaleString('pt-BR');
        
        let statusBadge = `<span class="badge-ok">Pendente</span>`;
        if (a.status === 'CONCLUIDO') statusBadge = `<span class="badge-ok" style="background:#DCFCE7; color:#16A34A;">Concluído (+10pts)</span>`;
        if (a.status === 'FALTOU') statusBadge = `<span class="badge-danger">Faltou (-5pts)</span>`;

        let actionBtns = '';
        if (a.status === 'PENDENTE') {
            actionBtns = `
                <button onclick="updateStatus('${a.id}', '${a.clienteId}', 'CONCLUIDO', '${a.servicoNome}')" class="action-btn" title="Marcar Presença" style="color: #16A34A;"><i class="ph ph-check"></i></button>
                <button onclick="updateStatus('${a.id}', '${a.clienteId}', 'FALTOU', '${a.servicoNome}')" class="action-btn" title="Marcar Falta" style="color: #EF4444;"><i class="ph ph-x"></i></button>
            `;
        }

        actionBtns += `<button onclick="whatsappLembrete('${a.clienteTelefone}', '${a.servicoNome}', '${a.dataHora}')" class="action-btn" title="Lembrete WPP"><i class="ph ph-whatsapp-logo" style="color: #25D366;"></i></button>`;

        tr.innerHTML = `
            <td>${dataStr}</td>
            <td>${a.clienteNome}</td>
            <td>${a.servicoNome}</td>
            <td>${statusBadge}</td>
            <td>${actionBtns}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveAgenda() {
    const selC = document.getElementById('agenda-cliente');
    const selS = document.getElementById('agenda-servico');
    const dataHora = document.getElementById('agenda-datahora').value;

    const clienteId = selC.value;
    const clienteNome = selC.options[selC.selectedIndex].getAttribute('data-nome');
    const clienteTelefone = selC.options[selC.selectedIndex].getAttribute('data-telefone');
    
    const servicoId = selS.value;
    const servicoNome = selS.options[selS.selectedIndex].getAttribute('data-nome');

    if (!clienteId || !servicoId || !dataHora) return alert('Preencha os campos');

    try {
        await db.collection("agendamentos").add({
            clienteId, clienteNome, clienteTelefone,
            servicoId, servicoNome,
            dataHora,
            status: 'PENDENTE'
        });
        
        document.getElementById('modal-agenda').classList.add('hidden');
        loadAgenda();
    } catch (error) {
        alert("Erro ao salvar agenda.");
    }
}

async function updateStatus(agendaId, clienteId, status, servicoNome) {
    if (!confirm(`Confirmar status como ${status}?`)) return;

    try {
        const docRef = db.collection("agendamentos").doc(agendaId);
        await docRef.update({ status: status });

        // Update Points
        const clienteRef = db.collection("clientes").doc(clienteId);
        const docSnap = await clienteRef.get();
        if (docSnap.exists) {
            let pontosGanhos = 0;
            let msg = "";
            if (status === 'CONCLUIDO') {
                pontosGanhos = 10;
                msg = "Presença: " + servicoNome;
            } else if (status === 'FALTOU') {
                pontosGanhos = -5;
                msg = "Falta: " + servicoNome;
            }

            const currentPts = docSnap.data().pontos || 0;
            await clienteRef.update({ pontos: currentPts + pontosGanhos });

            // Record transaction
            await db.collection("transacoes").add({
                clienteId: clienteId,
                pontos: pontosGanhos,
                descricao: msg,
                dataTransacao: new Date().toISOString()
            });
        }
        
        loadAgenda();
    } catch (e) {
        alert("Erro ao atualizar status.");
        console.error(e);
    }
}

function whatsappLembrete(telefone, servico, dataStr) {
    if (!telefone) return alert("Cliente sem telefone.");
    const numero = telefone.replace(/\D/g, '');
    const dataFormatada = new Date(dataStr).toLocaleString('pt-BR');
    const txt = `Olá! Lembrete do seu agendamento de ${servico} na CliniSync para o dia ${dataFormatada}. Contamos com sua presença! (Comparecer rende +10 Pontos!)`;
    const url = `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(txt)}`;
    window.open(url, '_blank');
}
