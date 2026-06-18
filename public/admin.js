let db;

// Helper: normalize string removing accents for tolerant search
function normalizeString(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Helper: show loading spinner in a container
function showSpinner(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<div class="loading-overlay" role="status" aria-label="Carregando"><div class="spinner"></div><span>Carregando...</span></div>';
}


document.addEventListener('DOMContentLoaded', async () => {
    // Admin Auth Guard
    if (sessionStorage.getItem('admin_logged') !== 'true') {
        window.location.replace('login.html');
        return;
    }

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
    
    // Add Logout logic to Portal do Cliente button
    document.getElementById('btn-logout-admin').addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('admin_logged');
        window.location.replace('login.html');
    });

    // Theme initialization
    const savedTheme = localStorage.getItem('theme');
    const adminToggle = document.getElementById('admin-theme-toggle');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (adminToggle) adminToggle.checked = savedTheme === 'dark';
    }
    if (adminToggle) {
        adminToggle.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            const themeToSet = isDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', themeToSet);
            localStorage.setItem('theme', themeToSet);
        });
    }

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
        document.getElementById('recompensa-nivel').value = '';
        document.getElementById('recompensa-nivel').value = '';
        document.getElementById('recompensa-visivel').checked = true;
        document.getElementById('recompensa-aniversario').checked = false;
        document.getElementById('recompensa-custo').value = '';
        document.getElementById('recompensa-desc').value = '';
        document.getElementById('modal-recompensa').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-recompensa').addEventListener('click', () => document.getElementById('modal-recompensa').classList.add('hidden'));
    document.getElementById('btn-save-recompensa').addEventListener('click', saveRecompensa);

    // Bind buttons - Agenda
    document.getElementById('btn-add-agenda').addEventListener('click', () => {
        document.getElementById('agenda-id').value = '';
        document.getElementById('agenda-datahora').value = '';
        document.getElementById('agenda-status').value = 'agendado';
        document.getElementById('agenda-pagamento').value = 'PENDENTE';
        document.getElementById('modal-agenda').classList.remove('hidden');
        populateSelects();
    });
    document.getElementById('btn-cancel-agenda').addEventListener('click', () => document.getElementById('modal-agenda').classList.add('hidden'));
    document.getElementById('btn-save-agenda').addEventListener('click', saveAgenda);

    // Agenda View & Config Binds
    document.getElementById('btn-view-lista').addEventListener('click', () => switchAgendaView('lista'));
    document.getElementById('btn-view-calendario').addEventListener('click', () => switchAgendaView('calendario'));
    document.getElementById('btn-config-agenda').addEventListener('click', () => document.getElementById('modal-agenda-config').classList.remove('hidden'));
    document.getElementById('btn-cancel-config').addEventListener('click', () => document.getElementById('modal-agenda-config').classList.add('hidden'));
    document.getElementById('btn-save-config').addEventListener('click', saveAgendaConfig);
    
    document.getElementById('btn-prev-week').addEventListener('click', () => changeCalendarWeek(-1));
    document.getElementById('btn-next-week').addEventListener('click', () => changeCalendarWeek(1));

    document.getElementById('agenda-search')?.addEventListener('input', renderAgendaTable);
    document.getElementById('agenda-filter-status')?.addEventListener('change', renderAgendaTable);

    document.getElementById('clientes-search')?.addEventListener('input', renderClientesTable);
    document.getElementById('simulador-search')?.addEventListener('input', renderSimuladorSelect);

    loadAgendaConfig(); // Load config before generating calendar
});

let clientesCache = [];

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
            if (viewId === 'view-simulador') loadSimulador();

            closeSidebarMobile();
        });
    });
}

function initSidebarToggle() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (toggleBtn && sidebar && overlay) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });

        overlay.addEventListener('click', closeSidebarMobile);
    }
}

function closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
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
        
        let nivelBadge = '';
        if (r.nivelMinimo) {
            const nivelNomes = { 'prata': '🥈 Prata+', 'ouro': '🥇 Ouro+', 'diamante': '💎 Diamante' };
            const nNome = nivelNomes[r.nivelMinimo] || r.nivelMinimo;
            nivelBadge = `<span class="badge-tipo" style="background: rgba(245, 158, 11, 0.1); color: #F59E0B; margin-left: 8px;">Exige ${nNome}</span>`;
        }

        const card = document.createElement('div');
        card.className = 'recompensa-card';
        card.innerHTML = `
            <div class="rc-header">
                <div>
                    <h4>${r.nome}</h4>
                    <span class="badge-tipo ${tipoBadge}">${tipoText}</span>
                    ${nivelBadge}
                </div>
                <div class="rc-actions">
                    <button onclick="editRecompensa('${doc.id}')" class="action-btn" title="Editar" aria-label="Editar recompensa ${r.nome}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                    <button onclick="deleteRecompensa('${doc.id}')" class="action-btn delete" title="Excluir" aria-label="Excluir recompensa ${r.nome}"><i class="ph ph-trash" aria-hidden="true"></i></button>
                </div>
            </div>
            <p class="rc-desc">${r.descricao || 'Sem descrição'}</p>
            <div class="rc-footer">
                <span class="rc-value">${tipoLabel}</span>
                <span class="rc-cost"><i class="ph ph-star" aria-hidden="true" style="margin-right: 4px;"></i>${r.custoPontos} pts</span>
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
    const nivelMinimo = document.getElementById('recompensa-nivel').value;
    const visivelInferiores = document.getElementById('recompensa-visivel').checked;
    const isAniversario = document.getElementById('recompensa-aniversario').checked;
    const custoPontos = parseInt(document.getElementById('recompensa-custo').value);
    const descricao = document.getElementById('recompensa-desc').value;

    if (!nome || isNaN(valor) || isNaN(custoPontos)) return alert('Preencha todos os campos corretamente.');

    try {
        const data = { nome, tipo, valor, nivelMinimo, visivelInferiores, isAniversario, custoPontos, descricao };
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
        document.getElementById('recompensa-nivel').value = r.nivelMinimo || '';
        document.getElementById('recompensa-visivel').checked = r.visivelInferiores !== false;
        document.getElementById('recompensa-aniversario').checked = r.isAniversario === true;
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
    showSpinner('ranking-tbody');
    showSpinner('ultimas-consultas-tbody');
    const snapClientes = await db.collection("clientes").get();
    let clientes = [];
    snapClientes.forEach(doc => clientes.push({ id: doc.id, ...doc.data() }));
    
    const snapServicos = await db.collection("servicos").get();
    let servicosObj = {};
    snapServicos.forEach(doc => {
        servicosObj[doc.data().nome] = doc.data().valorPadrao;
    });

    const snapAgenda = await db.collection("agendamentos").get();
    let agenda = [];
    snapAgenda.forEach(doc => agenda.push({ id: doc.id, ...doc.data() }));

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let receitaPaga = 0;
    let receitaPendente = 0;
    let consultasMes = 0;

    agenda.forEach(a => {
        if (a.status === 'CONCLUIDO') {
            const dataAgendamento = new Date(a.dataHora);
            if (dataAgendamento.getMonth() === currentMonth && dataAgendamento.getFullYear() === currentYear) {
                consultasMes++;
                const preco = servicosObj[a.servicoNome] || 0;
                
                if (a.pagamentoStatus === 'PAGO') {
                    receitaPaga += preco;
                } else {
                    receitaPendente += preco;
                }
            }
        }
    });

    document.getElementById('kpi-clientes').textContent = clientes.length;
    document.getElementById('kpi-receita').textContent = `R$ ${receitaPaga.toFixed(2).replace('.', ',')}`;
    document.getElementById('kpi-receita-pendente').textContent = `R$ ${receitaPendente.toFixed(2).replace('.', ',')}`;
    document.getElementById('kpi-consultas').textContent = consultasMes;

    // Ranking Table
    clientes.sort((a, b) => b.pontos - a.pontos);
    const tbodyRanking = document.getElementById('ranking-tbody');
    tbodyRanking.innerHTML = '';
    clientes.slice(0, 10).forEach((c, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Posição">#${index + 1}</td>
            <td data-label="Cliente" style="font-weight: 600;">${c.nome}</td>
            <td data-label="Pontuação" style="color: var(--primary-color); font-weight: bold;">${c.pontos} pts</td>
        `;
        tbodyRanking.appendChild(tr);
    });

    // Últimas Consultas Table
    const concluidos = agenda.filter(a => a.status === 'CONCLUIDO');
    concluidos.sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
    const tbodyUltimas = document.getElementById('ultimas-consultas-tbody');
    tbodyUltimas.innerHTML = '';
    
    if (concluidos.length === 0) {
        tbodyUltimas.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">Nenhum atendimento concluído.</td></tr>';
    } else {
        concluidos.slice(0, 8).forEach(a => {
            const dataStr = new Date(a.dataHora).toLocaleDateString('pt-BR');
            const preco = servicosObj[a.servicoNome] || 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Data">${dataStr}</td>
                <td data-label="Cliente">${a.clienteNome}</td>
                <td data-label="Serviço"><span class="tag-servico">${a.servicoNome}</span></td>
                <td data-label="Receita" style="font-weight: 600; color: #15803D;">+R$ ${preco.toFixed(2)}</td>
            `;
            tbodyUltimas.appendChild(tr);
        });
    }
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
    showSpinner('clientes-tbody');
    const snapshot = await db.collection("clientes").get();
    clientesCache = [];
    snapshot.forEach(doc => {
        clientesCache.push({ id: doc.id, ...doc.data() });
    });
    renderClientesTable();
}

function renderClientesTable() {
    const tbody = document.getElementById('clientes-tbody');
    tbody.innerHTML = '';
    
    const searchTerm = document.getElementById('clientes-search')?.value.toLowerCase() || '';
    
    const filtered = clientesCache.filter(c => {
        const nome = (c.nome || '').toLowerCase();
        const cpf = (c.cpf || '').toLowerCase();
        const tel = (c.telefone || '').toLowerCase();
        return nome.includes(searchTerm) || cpf.includes(searchTerm) || tel.includes(searchTerm);
    });

    filtered.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Nome">${c.nome}</td>
            <td data-label="CPF">${c.cpf || '-'}</td>
            <td data-label="WhatsApp">${c.telefone || '-'}</td>
            <td data-label="E-mail">${c.email || '-'}</td>
            <td data-label="Pontos" style="color: var(--primary-color); font-weight: bold;">${c.pontos} pts</td>
            <td data-label="Ações">
                <button onclick="whatsapp('${c.telefone}')" class="action-btn" title="WhatsApp" aria-label="Enviar WhatsApp para ${c.nome}"><i class="ph ph-whatsapp-logo" aria-hidden="true" style="color: #25D366;"></i></button>
                <button onclick="editCliente('${c.id}', '${c.nome}', '${c.telefone || ''}', '${c.email || ''}', '${c.aniversario || ''}', '${c.cpf || ''}')" class="action-btn" title="Editar" aria-label="Editar cliente ${c.nome}"><i class="ph ph-pencil-simple" aria-hidden="true" style="color: var(--primary-color);"></i></button>
                <button onclick="deleteCliente('${c.id}')" class="action-btn delete" title="Excluir" aria-label="Excluir cliente ${c.nome}"><i class="ph ph-trash" aria-hidden="true" style="color: var(--danger-color);"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editCliente(id, nome, telefone, email, aniversario, cpf) {
    document.getElementById('cliente-id').value = id;
    document.getElementById('cliente-nome').value = nome;
    document.getElementById('cliente-telefone').value = telefone;
    document.getElementById('cliente-email').value = email;
    document.getElementById('cliente-aniversario').value = aniversario;
    document.getElementById('cliente-cpf').value = cpf || '';
    document.getElementById('modal-cliente').classList.remove('hidden');
}

async function saveCliente() {
    const id = document.getElementById('cliente-id').value;
    const nome = document.getElementById('cliente-nome').value;
    const telefone = document.getElementById('cliente-telefone').value;
    const email = document.getElementById('cliente-email').value;
    const aniversario = document.getElementById('cliente-aniversario').value;
    const cpf = document.getElementById('cliente-cpf').value;
    if (!nome) return alert('Nome é obrigatório');

    try {
        if (id) {
            await db.collection("clientes").doc(id).update({ nome, telefone, email, aniversario, cpf });
        } else {
            await db.collection("clientes").add({ nome, telefone, email, aniversario, cpf, pontos: 0 });
        }
        
        document.getElementById('modal-cliente').classList.add('hidden');
        document.getElementById('cliente-id').value = '';
        document.getElementById('cliente-nome').value = '';
        document.getElementById('cliente-telefone').value = '';
        document.getElementById('cliente-email').value = '';
        document.getElementById('cliente-aniversario').value = '';
        document.getElementById('cliente-cpf').value = '';
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
            <td data-label="Serviço">${s.nome}</td>
            <td data-label="Valor Base">R$ ${Number(s.valorPadrao).toFixed(2)}</td>
            <td data-label="Ações">
                <button onclick="editServico('${doc.id}', '${s.nome}', ${s.valorPadrao})" class="action-btn" title="Editar" aria-label="Editar serviço ${s.nome}"><i class="ph ph-pencil-simple" aria-hidden="true" style="color: var(--text-primary);"></i></button>
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
    showSpinner('agenda-tbody');
    const snapshot = await db.collection("agendamentos").get();
    let agenda = [];
    snapshot.forEach(doc => agenda.push({ id: doc.id, ...doc.data() }));

    agendamentosCache = agenda; // Save to global cache for the calendar view

    renderAgendaTable();
}

function renderAgendaTable() {
    let agenda = [...agendamentosCache];

    const searchTerm = normalizeString(document.getElementById('agenda-search')?.value || '');
    const filterStatus = document.getElementById('agenda-filter-status')?.value || '';

    if (searchTerm) {
        agenda = agenda.filter(a => 
            (a.clienteNome && normalizeString(a.clienteNome).includes(searchTerm)) ||
            (a.servicoNome && normalizeString(a.servicoNome).includes(searchTerm))
        );
    }
    if (filterStatus) {
        agenda = agenda.filter(a => a.status === filterStatus);
    }

    const tbody = document.getElementById('agenda-tbody');
    tbody.innerHTML = '';
    
    // sort by date
    agenda.sort((a,b) => new Date(a.dataHora) - new Date(b.dataHora));

    agenda.forEach(a => {
        const tr = document.createElement('tr');
        const dataStr = new Date(a.dataHora).toLocaleString('pt-BR');
        
        // Check reminder urgency
        const dateCategory = (a.status === 'PENDENTE' || a.status === 'REAGENDADO') ? getDateDiffCategory(a.dataHora) : null;
        
        let dateAlertBadge = '';
        if (dateCategory === 'tomorrow') {
            dateAlertBadge = '<span class="date-alert-badge tomorrow">⚠️ Amanhã</span>';
        } else if (dateCategory === 'today') {
            dateAlertBadge = '<span class="date-alert-badge today">⏰ Hoje</span>';
        }

        let statusBadge = `<span class="badge-ok">Pendente</span>`;
        if (a.status === 'CONCLUIDO') statusBadge = `<span class="badge-ok" style="background:#DCFCE7; color:#15803D;">Concluído (+10pts)</span>`;
        if (a.status === 'FALTOU') statusBadge = `<span class="badge-danger">Faltou (-5pts)</span>`;
        if (a.status === 'CANCELADO') statusBadge = `<span class="badge-danger" style="background:#F3F4F6; color:#4B5563;">Cancelado</span>`;
        if (a.status === 'REAGENDADO') statusBadge = `<span class="badge-warning" style="background:#FEF3C7; color:#D97706;">Reagendado</span>`;

        let pagamentoBadge = '-';
        let actionBtns = '';

        if (a.status === 'CONCLUIDO') {
            if (a.pagamentoStatus === 'PAGO') {
                pagamentoBadge = `<span class="badge-ok" style="background:#DCFCE7; color:#15803D;">Pago</span>`;
            } else {
                pagamentoBadge = `<span class="badge-danger" style="background:#FFF0F0; color:#EF4444;">Pendente</span>`;
                actionBtns += `<button onclick="updatePagamento('${a.id}')" class="action-btn" title="Marcar como Pago" aria-label="Marcar pagamento como pago" style="color: #15803D; border-color: #15803D;"><i class="ph ph-currency-dollar" aria-hidden="true"></i></button>`;
            }
        }

        if (a.status === 'PENDENTE' || a.status === 'REAGENDADO') {
            actionBtns += `
                <button onclick="updateStatus('${a.id}', '${a.clienteId}', 'CONCLUIDO', '${a.servicoNome}')" class="action-btn" title="Marcar Presença" aria-label="Marcar presença de ${a.clienteNome}" style="color: #15803D;"><i class="ph ph-check" aria-hidden="true"></i></button>
                <button onclick="updateStatus('${a.id}', '${a.clienteId}', 'CANCELADO', '${a.servicoNome}')" class="action-btn" title="Cancelar Agendamento" aria-label="Cancelar agendamento de ${a.clienteNome}" style="color: #6B7280;"><i class="ph ph-prohibit" aria-hidden="true"></i></button>
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

        if (a.status === 'PENDENTE' || a.status === 'REAGENDADO') {
            actionBtns += `<button onclick="whatsappLembrete('${a.clienteTelefone}', '${a.servicoNome}', '${a.dataHora}')" class="${reminderClass}" title="Lembrete WPP" aria-label="Enviar lembrete por WhatsApp para ${a.clienteNome}"><i class="ph ph-whatsapp-logo" aria-hidden="true"${!dateCategory ? ' style="color: #25D366;"' : ''}></i>${reminderLabel}</button>`;
        }
        actionBtns += `<button onclick="editAgenda('${a.id}')" class="action-btn" title="Editar Agendamento" aria-label="Editar agendamento de ${a.clienteNome}" style="color: #3B82F6;"><i class="ph ph-pencil" aria-hidden="true"></i></button>`;

        tr.innerHTML = `
            <td data-label="Data e Hora">${dataStr}${dateAlertBadge}</td>
            <td data-label="Cliente">${a.clienteNome}</td>
            <td data-label="Serviço">${a.servicoNome}</td>
            <td data-label="Status">${statusBadge}</td>
            <td data-label="Pagamento">${pagamentoBadge}</td>
            <td data-label="Ações">${actionBtns}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function saveAgenda() {
    const agendaId = document.getElementById('agenda-id').value;
    const selC = document.getElementById('agenda-cliente');
    const selS = document.getElementById('agenda-servico');
    const dataHora = document.getElementById('agenda-datahora').value;
    let status = document.getElementById('agenda-status').value.toUpperCase();
    const pagamentoStatus = document.getElementById('agenda-pagamento').value;

    const clienteId = selC.value;
    const clienteNome = selC.options[selC.selectedIndex].getAttribute('data-nome');
    const clienteTelefone = selC.options[selC.selectedIndex].getAttribute('data-telefone');
    
    const servicoId = selS.value;
    const servicoNome = selS.options[selS.selectedIndex].getAttribute('data-nome');

    if (!clienteId || !servicoId || !dataHora) return alert('Preencha os campos');

    try {
        const payload = {
            clienteId, clienteNome, clienteTelefone,
            servicoId, servicoNome,
            dataHora,
            status: status,
            pagamentoStatus: pagamentoStatus
        };

        if (agendaId) {
            // Check for date change to automatically mark as REAGENDADO
            // Only force REAGENDADO if the user left the dropdown as PENDENTE
            const oldAgenda = agendamentosCache.find(a => a.id === agendaId);
            if (oldAgenda && oldAgenda.dataHora !== dataHora && status === 'PENDENTE') {
                payload.status = 'REAGENDADO';
            }
            await db.collection("agendamentos").doc(agendaId).update(payload);
        } else {
            await db.collection("agendamentos").add(payload);
            
            // Se já nascer concluído ou faltou, aplicar a lógica de pontos (apenas na criação)
            if (status === 'CONCLUIDO' || status === 'FALTOU') {
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
                    await db.collection("transacoes").add({
                        clienteId: clienteId,
                        pontos: pontosGanhos,
                        descricao: msg,
                        dataTransacao: new Date().toISOString()
                    });
                }
            }
        }

        document.getElementById('modal-agenda').classList.add('hidden');
        loadAgenda();
        loadDashboard();
    } catch (error) {
        alert("Erro ao salvar agenda.");
    }
}

function editAgenda(id) {
    const agenda = agendamentosCache.find(a => a.id === id);
    if (!agenda) return;

    populateSelects().then(() => {
        document.getElementById('agenda-id').value = agenda.id;
        document.getElementById('agenda-cliente').value = agenda.clienteId;
        document.getElementById('agenda-servico').value = agenda.servicoId;
        document.getElementById('agenda-datahora').value = agenda.dataHora;
        document.getElementById('agenda-status').value = agenda.status.toUpperCase();
        document.getElementById('agenda-pagamento').value = agenda.pagamentoStatus || 'PENDENTE';
        document.getElementById('modal-agenda').classList.remove('hidden');
    });
}

async function updatePagamento(agendaId) {
    if (!confirm('Confirmar recebimento do pagamento?')) return;
    try {
        await db.collection("agendamentos").doc(agendaId).update({ pagamentoStatus: 'PAGO' });
        loadAgenda();
        loadDashboard(); // Refresh KPI values
    } catch (e) {
        alert("Erro ao atualizar pagamento.");
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


// =============================================
// Agenda: Calendário Visual e Configurações
// =============================================

let agendaConfig = {
    dias: [1, 2, 3, 4, 5], // Seg a Sex
    horaInicio: '06:00',
    horaFim: '22:00',
    intervalo: 30
};

let currentWeekOffset = 0;
let agendamentosCache = [];

async function loadAgendaConfig() {
    try {
        const doc = await db.collection("configuracoes").doc("agendaConfig").get();
        if (doc.exists) {
            agendaConfig = doc.data();
            
            // Atualiza UI do modal de config
            document.getElementById('config-hora-inicio').value = agendaConfig.horaInicio;
            document.getElementById('config-hora-fim').value = agendaConfig.horaFim;
            document.getElementById('config-intervalo').value = agendaConfig.intervalo;
            
            const checkboxes = document.querySelectorAll('#agenda-dias-container input');
            checkboxes.forEach(cb => {
                cb.checked = agendaConfig.dias.includes(parseInt(cb.value));
            });
        }
    } catch(e) {
        console.error("Erro ao carregar config da agenda", e);
    }
}

async function saveAgendaConfig() {
    const horaInicio = document.getElementById('config-hora-inicio').value;
    const horaFim = document.getElementById('config-hora-fim').value;
    const intervalo = parseInt(document.getElementById('config-intervalo').value);
    
    const checkboxes = document.querySelectorAll('#agenda-dias-container input:checked');
    const dias = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    agendaConfig = { dias, horaInicio, horaFim, intervalo };
    
    try {
        await db.collection("configuracoes").doc("agendaConfig").set(agendaConfig);
        document.getElementById('modal-agenda-config').classList.add('hidden');
        renderCalendar();
    } catch(e) {
        alert("Erro ao salvar configurações.");
    }
}

function switchAgendaView(view) {
    const btnLista = document.getElementById('btn-view-lista');
    const btnCal = document.getElementById('btn-view-calendario');
    const divLista = document.getElementById('agenda-list-view');
    const divCal = document.getElementById('agenda-calendar-view');

    if (view === 'lista') {
        btnLista.classList.add('active');
        btnLista.style.background = 'var(--surface-color)';
        btnLista.style.color = 'var(--text-primary)';
        btnLista.style.boxShadow = 'var(--shadow-sm)';
        
        btnCal.classList.remove('active');
        btnCal.style.background = 'transparent';
        btnCal.style.color = 'var(--text-secondary)';
        btnCal.style.boxShadow = 'none';

        divLista.classList.remove('hidden');
        divCal.classList.add('hidden');
    } else {
        btnCal.classList.add('active');
        btnCal.style.background = 'var(--surface-color)';
        btnCal.style.color = 'var(--text-primary)';
        btnCal.style.boxShadow = 'var(--shadow-sm)';
        
        btnLista.classList.remove('active');
        btnLista.style.background = 'transparent';
        btnLista.style.color = 'var(--text-secondary)';
        btnLista.style.boxShadow = 'none';

        divLista.classList.add('hidden');
        divCal.classList.remove('hidden');
        
        renderCalendar();
    }
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // ajusta pra Segunda como inicio
    return new Date(d.setDate(diff));
}

function changeCalendarWeek(offset) {
    currentWeekOffset += offset;
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const today = new Date();
    today.setDate(today.getDate() + (currentWeekOffset * 7));
    const startOfWeek = getStartOfWeek(today);

    // Header dos dias
    const headerRow = document.createElement('div');
    headerRow.className = 'cal-header';
    headerRow.innerHTML = '<div class="cal-header-cell time-col">Horário</div>';

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let weekDates = [];

    // Gerar apenas os dias configurados
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startOfWeek);
        currentDate.setDate(startOfWeek.getDate() + i);
        
        if (agendaConfig.dias.includes(currentDate.getDay())) {
            weekDates.push(currentDate);
            headerRow.innerHTML += `<div class="cal-header-cell">${dayNames[currentDate.getDay()]}<br><span style="font-size: 12px; font-weight: 400;">${currentDate.toLocaleDateString('pt-BR').substring(0,5)}</span></div>`;
        }
    }
    grid.appendChild(headerRow);

    // Update Label
    let startLabel = weekDates[0] ? weekDates[0].toLocaleDateString('pt-BR') : '';
    let endLabel = weekDates[weekDates.length-1] ? weekDates[weekDates.length-1].toLocaleDateString('pt-BR') : '';
    document.getElementById('calendar-week-label').textContent = `${startLabel} a ${endLabel}`;

    // Gerar horários
    let [hIni, mIni] = agendaConfig.horaInicio.split(':').map(Number);
    let [hFim, mFim] = agendaConfig.horaFim.split(':').map(Number);
    const intervalo = agendaConfig.intervalo;

    let currentTime = new Date();
    currentTime.setHours(hIni, mIni, 0, 0);
    
    const endTime = new Date();
    endTime.setHours(hFim, mFim, 0, 0);

    while (currentTime < endTime) {
        const timeStr = currentTime.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        
        const row = document.createElement('div');
        row.className = 'cal-row';
        row.innerHTML = `<div class="cal-time">${timeStr}</div>`;

        weekDates.forEach(date => {
            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            
            // Format datetime exactly as input datetime-local requires (YYYY-MM-DDTHH:mm)
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const slotDateTimeStr = `${yyyy}-${mm}-${dd}T${timeStr}`;
            
            // Check if there is an appointment
            const appts = agendamentosCache.filter(a => a.dataHora === slotDateTimeStr);
            
            if (appts.length > 0) {
                appts.forEach(a => {
                    let stClass = '';
                    if (a.status === 'CONCLUIDO') stClass = 'concluido';
                    if (a.status === 'CANCELADO') stClass = 'cancelado';
                    if (a.status === 'FALTOU') stClass = 'faltou';
                    if (a.status === 'REAGENDADO') stClass = 'reagendado';

                    cell.innerHTML += `
                        <div class="cal-slot booked ${stClass}" title="${a.clienteNome} - ${a.servicoNome}" onclick="editAgenda('${a.id}')">
                            <div class="cal-slot-title">${a.clienteNome.split(' ')[0]}</div>
                            <div class="cal-slot-subtitle">${a.servicoNome}</div>
                        </div>
                    `;
                });
            } else {
                cell.addEventListener('click', () => {
                    document.getElementById('agenda-datahora').value = slotDateTimeStr;
                    document.getElementById('modal-agenda').classList.remove('hidden');
                    populateSelects();
                });
            }
            
            row.appendChild(cell);
        });

        grid.appendChild(row);
        currentTime.setMinutes(currentTime.getMinutes() + intervalo);
    }
}

// =============================================
// Simulador Visão Cliente
// =============================================
async function loadSimulador() {
    const select = document.getElementById('simulador-client-select');
    select.innerHTML = '<option value="">Carregando...</option>';
    
    if (clientesCache.length === 0) {
        const snapshot = await db.collection("clientes").get();
        clientesCache = [];
        snapshot.forEach(doc => {
            clientesCache.push({ id: doc.id, ...doc.data() });
        });
    }
    
    renderSimuladorSelect();
    
    select.removeEventListener('change', onSimuladorChange);
    select.addEventListener('change', onSimuladorChange);
}

function renderSimuladorSelect() {
    const select = document.getElementById('simulador-client-select');
    const searchTerm = document.getElementById('simulador-search')?.value.toLowerCase() || '';
    
    select.innerHTML = '<option value="">Selecione um cliente para simular...</option>';
    
    const filtered = clientesCache.filter(c => {
        const nome = (c.nome || '').toLowerCase();
        const cpf = (c.cpf || '').toLowerCase();
        return nome.includes(searchTerm) || cpf.includes(searchTerm);
    });

    filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.nome} ${c.cpf ? `(${c.cpf})` : ''}`;
        select.appendChild(opt);
    });
}

async function onSimuladorChange(e) {
    const clienteId = e.target.value;
    const portal = document.getElementById('simulador-portal');
    const emptyMsg = document.getElementById('simulador-empty');

    if (!clienteId) {
        portal.style.display = 'none';
        emptyMsg.style.display = 'block';
        return;
    }

    portal.style.display = 'none';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'Carregando portal do cliente...';

    try {
        const docRef = await db.collection("clientes").doc(clienteId).get();
        if (!docRef.exists) return;
        
        const cliente = { id: docRef.id, ...docRef.data() };
        
        document.getElementById('simulador-points').innerHTML = `${cliente.pontos || 0} <span style="font-size: 20px; font-weight: normal;">Pontos</span>`;
        
        // Gamificação
        const pontos = cliente.pontos || 0;
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
        
        document.getElementById('simulador-level-badge').innerHTML = `<span class="level-badge ${currentLevel.css}">${currentLevel.icon} ${currentLevel.name}</span>`;
        
        const progressFill = document.getElementById('simulador-progress-fill');
        const progressLabelLevel = document.getElementById('simulador-progress-label-level');
        const progressLabelNext = document.getElementById('simulador-progress-label-next');
        
        if (progressFill) {
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

        // Extrato
        const snapExtrato = await db.collection("transacoes").where("clienteId", "==", clienteId).get();
        let extrato = [];
        snapExtrato.forEach(doc => extrato.push(doc.data()));
        extrato.sort((a, b) => new Date(b.dataTransacao) - new Date(a.dataTransacao));
        
        const listaEl = document.getElementById('simulador-extrato-lista');
        listaEl.innerHTML = '';
        if (extrato.length === 0) {
            listaEl.innerHTML = '<div style="text-align:center; color: var(--text-secondary); padding: 20px;">Nenhuma movimentação.</div>';
        } else {
            extrato.forEach(t => {
                const isPositive = t.pontos > 0;
                const sign = isPositive ? '+' : '';
                const color = isPositive ? '#15803D' : 'var(--danger-color)';
                const dateStr = new Date(t.dataTransacao).toLocaleDateString('pt-BR');
                
                listaEl.innerHTML += `
                    <div style="display: flex; justify-content: space-between; padding: 12px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 8px;">
                        <div>
                            <p style="font-weight: 500; font-size: 14px; margin-bottom: 4px;">${t.descricao}</p>
                            <p style="font-size: 12px; color: var(--text-secondary);">${dateStr}</p>
                        </div>
                        <div style="font-weight: bold; color: ${color}; align-self: center;">${sign}${t.pontos}</div>
                    </div>
                `;
            });
        }
        
        emptyMsg.style.display = 'none';
        portal.style.display = 'block';

    } catch(e) {
        console.error(e);
        emptyMsg.textContent = 'Erro ao carregar dados do cliente.';
    }
}
