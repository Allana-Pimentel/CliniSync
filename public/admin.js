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
    initSidebarToggle();
    
    // Create default services if empty
    await checkDefaultServices();
    // Migrate old config to new recompensas collection
    await migrateOldConfig();
    
    loadDashboard();
    
    // Bind buttons - Clientes
    document.getElementById('btn-add-cliente').addEventListener('click', () => {
        document.getElementById('cliente-id').value = '';
        document.getElementById('cliente-nome').value = '';
        document.getElementById('cliente-telefone').value = '';
        document.getElementById('cliente-email').value = '';
        document.getElementById('cliente-aniversario').value = '';
        document.getElementById('modal-cliente').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-cliente').addEventListener('click', () => document.getElementById('modal-cliente').classList.add('hidden'));
    document.getElementById('btn-save-cliente').addEventListener('click', saveCliente);

    // Bind buttons - Serviços
    document.getElementById('btn-add-servico').addEventListener('click', () => {
        document.getElementById('servico-id').value = '';
        document.getElementById('servico-nome').value = '';
        document.getElementById('servico-valor').value = '';
        document.getElementById('modal-servico').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-servico').addEventListener('click', () => document.getElementById('modal-servico').classList.add('hidden'));
    document.getElementById('btn-save-servico').addEventListener('click', saveServico);

    // Bind buttons - Recompensas
    document.getElementById('btn-add-recompensa').addEventListener('click', () => {
        document.getElementById('recompensa-id').value = '';
        document.getElementById('recompensa-nome').value = '';
        document.getElementById('recompensa-tipo').value = 'desconto';
        document.getElementById('recompensa-valor').value = '';
        document.getElementById('recompensa-custo').value = '';
        document.getElementById('recompensa-desc').value = '';
        document.getElementById('modal-recompensa').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-recompensa').addEventListener('click', () => document.getElementById('modal-recompensa').classList.add('hidden'));
    document.getElementById('btn-save-recompensa').addEventListener('click', saveRecompensa);

    // Bind buttons - Agenda
    document.getElementById('btn-add-agenda').addEventListener('click', () => {
        document.getElementById('modal-agenda').classList.remove('hidden');
        populateSelects();
    });
    document.getElementById('btn-cancel-agenda').addEventListener('click', () => document.getElementById('modal-agenda').classList.add('hidden'));
    document.getElementById('btn-save-agenda').addEventListener('click', saveAgenda);
});

// =============================================
// Mobile Sidebar Toggle
// =============================================
function initSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if (!toggle || !sidebar || !overlay) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
}

function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

// =============================================
// Migration: old config -> new recompensas
// =============================================
async function migrateOldConfig() {
    try {
        const configDoc = await db.collection("configuracoes").doc("recompensas").get();
        if (!configDoc.exists) return;

        // Check if we already have recompensas
        const existingSnap = await db.collection("recompensas").limit(1).get();
        if (!existingSnap.empty) return; // Already migrated

        const data = configDoc.data();
        
        if (data.cupom1) {
            await db.collection("recompensas").add({
                nome: `Cupom ${data.cupom1.percentual}% OFF`,
                descricao: "Em qualquer procedimento",
                tipo: "desconto",
                valor: data.cupom1.percentual,
                custoPontos: data.cupom1.pontos
            });
        }
        if (data.cupom2) {
            await db.collection("recompensas").add({
                nome: `Cupom ${data.cupom2.percentual}% OFF`,
                descricao: "Em qualquer procedimento",
                tipo: "desconto",
                valor: data.cupom2.percentual,
                custoPontos: data.cupom2.pontos
            });
        }

        console.log("Migração de configurações antigas concluída.");
    } catch(e) {
        console.error("Erro na migração:", e);
    }
}

async function checkDefaultServices() {
    const snapshot = await db.collection("servicos").limit(1).get();
    if (snapshot.empty) {
        await db.collection("servicos").add({ nome: "Limpeza", valorPadrao: 150 });
        await db.collection("servicos").add({ nome: "Consulta", valorPadrao: 100 });
        await db.collection("servicos").add({ nome: "Cirurgia", valorPadrao: 500 });
    }
}

function initNavigation() {
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
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
            if (viewId === 'view-recompensas') loadRecompensas();

            closeSidebarMobile();
        });
    });
}

// =============================================
// Recompensas CRUD
// =============================================
async function loadRecompensas() {
    const snapshot = await db.collection("recompensas").get();
    const container = document.getElementById('recompensas-container');
    const emptyMsg = document.getElementById('recompensas-empty');
    container.innerHTML = '';

    if (snapshot.empty) {
        emptyMsg.classList.remove('hidden');
        return;
    }

    emptyMsg.classList.add('hidden');

    snapshot.forEach(doc => {
        const r = doc.data();
        const tipoLabel = r.tipo === 'desconto' ? `${r.valor}% OFF` : `R$ ${Number(r.valor).toFixed(2)}`;
        const tipoBadge = r.tipo === 'desconto' ? 'desconto' : 'bonus';
        const tipoText = r.tipo === 'desconto' ? 'Desconto' : 'Bônus';

        const card = document.createElement('div');
        card.className = 'recompensa-card';
        card.innerHTML = `
            <div class="rc-header">
                <div>
                    <h4>${r.nome}</h4>
                    <span class="badge-tipo ${tipoBadge}">${tipoText}</span>
                </div>
                <div class="rc-actions">
                    <button onclick="editRecompensa('${doc.id}')" class="action-btn" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                    <button onclick="deleteRecompensa('${doc.id}')" class="action-btn delete" title="Excluir"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            <p class="rc-desc">${r.descricao || 'Sem descrição'}</p>
            <div class="rc-footer">
                <span class="rc-value">${tipoLabel}</span>
                <span class="rc-cost"><i class="ph ph-star" style="margin-right: 4px;"></i>${r.custoPontos} pts</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function saveRecompensa() {
    const id = document.getElementById('recompensa-id').value;
    const nome = document.getElementById('recompensa-nome').value;
    const tipo = document.getElementById('recompensa-tipo').value;
    const valor = parseFloat(document.getElementById('recompensa-valor').value);
    const custoPontos = parseInt(document.getElementById('recompensa-custo').value);
    const descricao = document.getElementById('recompensa-desc').value;

    if (!nome || isNaN(valor) || isNaN(custoPontos)) return alert('Preencha todos os campos corretamente.');

    try {
        const data = { nome, tipo, valor, custoPontos, descricao };
        if (id) {
            await db.collection("recompensas").doc(id).update(data);
        } else {
            await db.collection("recompensas").add(data);
        }
        document.getElementById('modal-recompensa').classList.add('hidden');
        loadRecompensas();
    } catch(e) {
        alert("Erro ao salvar recompensa.");
        console.error(e);
    }
}

async function editRecompensa(id) {
    try {
        const doc = await db.collection("recompensas").doc(id).get();
        if (!doc.exists) return;
        const r = doc.data();
        document.getElementById('recompensa-id').value = id;
        document.getElementById('recompensa-nome').value = r.nome;
        document.getElementById('recompensa-tipo').value = r.tipo;
        document.getElementById('recompensa-valor').value = r.valor;
        document.getElementById('recompensa-custo').value = r.custoPontos;
        document.getElementById('recompensa-desc').value = r.descricao || '';
        document.getElementById('modal-recompensa').classList.remove('hidden');
    } catch(e) {
        alert("Erro ao carregar recompensa.");
    }
}

async function deleteRecompensa(id) {
    if (!confirm('Tem certeza que deseja excluir esta recompensa?')) return;
    try {
        await db.collection("recompensas").doc(id).delete();
        loadRecompensas();
    } catch(e) {
        alert("Erro ao excluir recompensa.");
    }
}

// =============================================
// Dashboard
// =============================================
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

// =============================================
// Clientes
// =============================================
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
            <td>${c.email || '-'}</td>
            <td style="color: var(--primary-color); font-weight: bold;">${c.pontos} pts</td>
            <td>
                <button onclick="whatsapp('${c.telefone}')" class="action-btn" title="WhatsApp"><i class="ph ph-whatsapp-logo" style="color: #25D366;"></i></button>
                <button onclick="editCliente('${doc.id}', '${c.nome}', '${c.telefone || ''}', '${c.email || ''}', '${c.aniversario || ''}')" class="action-btn" title="Editar"><i class="ph ph-pencil-simple" style="color: var(--primary-color);"></i></button>
                <button onclick="deleteCliente('${doc.id}')" class="action-btn delete" title="Excluir"><i class="ph ph-trash" style="color: var(--danger-color);"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editCliente(id, nome, telefone, email, aniversario) {
    document.getElementById('cliente-id').value = id;
    document.getElementById('cliente-nome').value = nome;
    document.getElementById('cliente-telefone').value = telefone;
    document.getElementById('cliente-email').value = email;
    document.getElementById('cliente-aniversario').value = aniversario;
    document.getElementById('modal-cliente').classList.remove('hidden');
}

async function saveCliente() {
    const id = document.getElementById('cliente-id').value;
    const nome = document.getElementById('cliente-nome').value;
    const telefone = document.getElementById('cliente-telefone').value;
    const email = document.getElementById('cliente-email').value;
    const aniversario = document.getElementById('cliente-aniversario').value;
    if (!nome) return alert('Nome é obrigatório');

    try {
        if (id) {
            await db.collection("clientes").doc(id).update({ nome, telefone, email, aniversario });
        } else {
            await db.collection("clientes").add({ nome, telefone, email, aniversario, pontos: 0 });
        }
        
        document.getElementById('modal-cliente').classList.add('hidden');
        document.getElementById('cliente-id').value = '';
        document.getElementById('cliente-nome').value = '';
        document.getElementById('cliente-telefone').value = '';
        document.getElementById('cliente-email').value = '';
        document.getElementById('cliente-aniversario').value = '';
        loadClientes();
    } catch (error) {
        alert("Erro ao salvar cliente no Firestore.");
        console.error(error);
    }
}

async function deleteCliente(id) {
    if (!confirm('Tem certeza que deseja excluir este cliente? Isso não pode ser desfeito.')) return;
    try {
        await db.collection("clientes").doc(id).delete();
        loadClientes();
    } catch(e) {
        alert("Erro ao excluir cliente.");
        console.error(e);
    }
}

// =============================================
// Serviços
// =============================================
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

// =============================================
// Agenda (with reminder alerts)
// =============================================
function getDateDiffCategory(dataHoraStr) {
    const now = new Date();
    const agendamento = new Date(dataHoraStr);
    
    // Normalize to date-only for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const agendaDate = new Date(agendamento.getFullYear(), agendamento.getMonth(), agendamento.getDate());
    
    const diffMs = agendaDate - today;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    return null;
}

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
    
    // sort by date
    agenda.sort((a,b) => new Date(a.dataHora) - new Date(b.dataHora));

    agenda.forEach(a => {
        const tr = document.createElement('tr');
        const dataStr = new Date(a.dataHora).toLocaleString('pt-BR');
        
        // Check reminder urgency
        const dateCategory = (a.status === 'PENDENTE') ? getDateDiffCategory(a.dataHora) : null;
        
        let dateAlertBadge = '';
        if (dateCategory === 'tomorrow') {
            dateAlertBadge = '<span class="date-alert-badge tomorrow">⚠️ Amanhã</span>';
        } else if (dateCategory === 'today') {
            dateAlertBadge = '<span class="date-alert-badge today">⏰ Hoje</span>';
        }

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

        // Reminder button with visual alert
        let reminderClass = 'action-btn';
        let reminderLabel = '';
        if (dateCategory === 'tomorrow') {
            reminderClass = 'reminder-urgent';
            reminderLabel = ' Enviar Lembrete!';
        } else if (dateCategory === 'today') {
            reminderClass = 'reminder-today';
            reminderLabel = ' Lembrar Hoje!';
        }

        actionBtns += `<button onclick="whatsappLembrete('${a.clienteTelefone}', '${a.servicoNome}', '${a.dataHora}')" class="${reminderClass}" title="Lembrete WPP"><i class="ph ph-whatsapp-logo"${!dateCategory ? ' style="color: #25D366;"' : ''}></i>${reminderLabel}</button>`;

        tr.innerHTML = `
            <td>${dataStr}${dateAlertBadge}</td>
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
