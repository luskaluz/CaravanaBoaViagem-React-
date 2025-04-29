require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin"); 
const path = require("path");
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// Inicializa o Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), 
    }),
});

const db = admin.firestore();


app.use(cors()); 
app.use(express.json()); 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    },
    // tls: { rejectUnauthorized: false } // REMOVIDO - Inseguro para produção
});


// FUNÇÕES HELPER

function formatDate(dateString) {
    if (!dateString) return '';
    let date;
    if (dateString && typeof dateString.toDate === 'function') { 
         date = dateString.toDate();
    } else {
         date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
        console.warn(`Formato de data inválido recebido: ${dateString}`);
        return typeof dateString === 'string' ? dateString : 'Data inválida';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// Busca dados essenciais de uma localidade pelo ID
async function getLocalidadeData(localidadeId) {
    if (!localidadeId) {
        return {};
    }
    try {
        const localidadeDoc = await db.collection('localidades').doc(localidadeId).get();
        if (localidadeDoc.exists) {
            const data = localidadeDoc.data();
            return {
                nomeLocalidade: data.nome,
                imagensLocalidade: data.imagens || [],
                descricaoLocalidade: data.descricao
            };
        }
        return {};
    } catch (error) {
        console.error(`Erro ao buscar localidade ${localidadeId}:`, error);
        return {};
    }
}


async function getMaxCapacidadeTransporteDisponivel() {
    try {
        const transportesSnap = await db.collection('transportes')
                                        .where('disponivel', '==', true)
                                        .orderBy('assentos', 'desc') // Pega o maior primeiro
                                        .limit(1)
                                        .get();
        if (!transportesSnap.empty) {
            return transportesSnap.docs[0].data().assentos || 0;
        }
        return 0; // Retorna 0 se não houver nenhum disponível
    } catch (error) {
        console.error("Erro ao buscar capacidade máxima de transporte:", error);
        return 0; // Retorna 0 em caso de erro
    }
}

async function getFuncionarioData(uid) {
    if (!uid) {
        return null;
    }

    try {
        const snapshot = await db.collection('funcionarios')
                                  .where('uid', '==', uid)
                                  .limit(1) 
                                  .get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0]; 
            const data = doc.data();

            return {
                uid: uid,
                nome: data.nome || 'Nome Indisponível',
                email: data.email || null,
                telefone: data.telefone || null,
                fotoUrl: data.fotoUrl || null,
                cargo: data.cargo || null
            };
        } else {
            console.warn(`Funcionário com campo 'uid' ${uid} não encontrado na coleção 'funcionarios'.`);
            return null;
        }
    } catch (error) {
        console.error(`Erro ao buscar funcionário pelo campo UID ${uid}:`, error);
        return null; 
    }
}
    


// Calcula métricas financeiras (ROI, Lucro Máximo) para uma caravana
function calculateCaravanaMetrics(caravana) {
    const preco = parseFloat(caravana.preco) || 0;
    const vagasTotais = parseInt(caravana.vagasTotais) || 0;
    const despesas = parseFloat(caravana.despesas) || 0;

    const receitaMaxima = preco * vagasTotais;
    const lucroMaximo = receitaMaxima - despesas;
    const roi = despesas > 0 ? (lucroMaximo / despesas) * 100 : (lucroMaximo > 0 ? Infinity : 0);

    const vagasOcupadas = vagasTotais - (parseInt(caravana.vagasDisponiveis) || 0);
    const receitaAtual = vagasOcupadas * preco;
    const lucroAtual = receitaAtual - despesas;
    const roiAtual = despesas > 0 ? (lucroAtual / despesas) * 100 : (lucroAtual > 0 ? Infinity : 0);

    return {
        roi: roi, 
        lucroMaximo: lucroMaximo,
        roiAtual: roiAtual,
        lucroAtual: lucroAtual,
        vagasOcupadas: vagasOcupadas,
    };
}


async function buscarParticipantesParaNotificacao(caravanaId) {
    const participantesNotificar = [];
    const emailsAdicionados = new Set();

    if (!caravanaId) {
        console.warn("[Notificação] caravanaId não fornecido para buscarParticipantesParaNotificacao.");
        return [];
    }

    try {
        const participantesSnapshot = await db.collection("participantes")
            .where("caravanaId", "==", caravanaId)
            .get();

        participantesSnapshot.forEach(doc => {
            const participante = doc.data();
            if (participante && participante.email) {
                if (!emailsAdicionados.has(participante.email)) {
                    emailsAdicionados.add(participante.email);
                    participantesNotificar.push({
                        email: participante.email,
                        uid: participante.uid || null
                    });
                }
            } else {
                 console.warn(`[Notificação] Participante ${doc.id} na caravana ${caravanaId} sem email válido.`);
            }
        });
        return participantesNotificar;

    } catch (error) {
        console.error(`[Notificação] Erro ao buscar participantes para notificação da caravana ${caravanaId}:`, error);
        return [];
    }
}

// Valida os dados de entrada para o registro de usuário
const validarDadosCadastro = (nome, email, telefone, idade) => {
    if (!nome || !email || !telefone || !idade) {
        return "Todos os campos são obrigatórios.";
    }
    const regexTelefone = /^\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}$/;
    if (!regexTelefone.test(telefone)) {
        return "Telefone inválido. Use (XX) XXXX-XXXX ou (XX) XXXXX-XXXX.";
    }
    const idadeNum = parseInt(idade, 10);
    if (isNaN(idadeNum) || idadeNum < 18) { 
        return "Você deve ter 18 anos ou mais para realizar o cadastro.";
    }
    return null;
};

// Envia um e-mail usando o transporter configurado
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: `"Caravana da Boa Viagem" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        };
        const info = await transporter.sendMail(mailOptions);
        console.log('Email enviado:', info.messageId, 'para:', to);
        return info;
    } catch (error) {
        console.error(`Erro ao enviar email para ${to} com assunto "${subject}":`, error);
    }
}

// Envia emails de forma assíncrona após a compra de ingresso ser confirmada no DB
async function enviarEmailsPosCompra(usuarioEmail, quantidade, caravanaId, caravanaData, nomeLocalidade) {
    try {
        const emailCompraSubject = `Confirmação de Compra - Caravana para ${nomeLocalidade}`;
        const emailCompraHtml = `
            <p>Olá!</p>
            <p>Sua compra de ${quantidade} ingresso(s) para a caravana com destino a ${nomeLocalidade} na data ${formatDate(caravanaData.data)} foi realizada com sucesso!</p>
            <p>Detalhes:</p>
            <ul>
                <li>Localidade: ${nomeLocalidade}</li>
                <li>Data: ${formatDate(caravanaData.data)}</li>
                <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>
                ${caravanaData.status === 'confirmada' ? '<li><b>Status:</b> Caravana Confirmada!</li>' : ''}
            </ul>
            <p>Agradecemos a preferência!</p>
        `;
        await sendEmail(usuarioEmail, emailCompraSubject, emailCompraHtml);

        if (caravanaData.status === 'confirmada') {
            const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
            if (participantesNotificar.length > 0) {
                const emailConfirmacaoSubject = `Caravana para ${nomeLocalidade} Confirmada!`;
                const emailConfirmacaoHtml = `
                    <p>Olá!</p>
                    <p>A caravana para ${nomeLocalidade} na data ${formatDate(caravanaData.data)} foi confirmada!</p>
                    <p>Detalhes:</p>
                    <ul>
                        <li>Localidade: ${nomeLocalidade}</li>
                        <li>Data: ${formatDate(caravanaData.data)}</li>
                        <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>
                    </ul>
                `;
                for (const participante of participantesNotificar) {
                    if (participante.email !== usuarioEmail) {
                        await sendEmail(participante.email, emailConfirmacaoSubject, emailConfirmacaoHtml);
                    }
                }
            }
        }
    } catch (emailError) {
        console.error(`Falha ao enviar e-mail(s) após compra para caravana ${caravanaId}:`, emailError);
    }
}





// MIDDLEWARE DE AUTENTICAÇÃO

// Middleware para verificar o token de autenticação Firebase
const verificarAutenticacao = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token de autenticação não fornecido.' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; 
        next();
    } catch (error) {
        console.error("Erro ao verificar token:", error.code);
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({ message: 'Token expirado.' });
        } else if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
             return res.status(401).json({ message: 'Token inválido.' });
        } else {
            return res.status(403).json({ message: 'Falha na autenticação.' });
        }
    }
};

// Middleware para verificar se o usuário autenticado é um administrador
const verificarAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
    }

    try {
        const email = req.user.email;
        if (email !== process.env.ADMIN_EMAIL) {
            return res.status(403).json({ error: "Acesso negado. Permissões insuficientes." });
        }
        next();
    } catch (error) {
        console.error("Erro ao verificar admin:", error);
        res.status(500).json({ error: "Erro ao verificar permissões de administrador." });
    }
};

const verificarFuncionarioOuAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
    }

    try {
        const email = req.user.email;
        const uid = req.user.uid; // UID do Firebase Auth do usuário logado

        // 1. Verifica se é Admin Geral
        if (email === process.env.ADMIN_EMAIL) {
            // console.log("Acesso permitido: Admin Geral");
            return next();
        }

        const querySnapshot = await db.collection('funcionarios')
                                     .where('uid', '==', uid) 
                                     .limit(1)
                                     .get();

        // 3. Verifica se a consulta encontrou um documento
        if (!querySnapshot.empty) {
            return next();
        }

        // 4. Se não encontrou nem como Admin nem como Funcionário
        console.warn(`Acesso negado para ${email} (UID: ${uid}) - Não é Admin nem Funcionário registrado.`);
        return res.status(403).json({ error: "Acesso negado. Permissões insuficientes." });

    } catch (error) {
        console.error("Erro ao verificar permissões de funcionário ou admin:", error);
        res.status(500).json({ error: "Erro interno ao verificar permissões." });
    }
};


async function alocarTransporte(pessoas, transportesDisponiveis) {
    if (pessoas <= 0) return { alocacao: [], custoTotal: 0 };
    if (!transportesDisponiveis || transportesDisponiveis.length === 0) return null; // Impossível sem transportes

    // 1. Calcula custo por assento e ordena do mais barato para o mais caro por assento
    const transportesOrdenados = transportesDisponiveis
        .map(t => ({ ...t, custoPorAssento: t.assentos > 0 ? t.custoAluguel / t.assentos : Infinity }))
        .sort((a, b) => a.custoPorAssento - b.custoPorAssento);

    let pessoasRestantes = pessoas;
    const alocacaoFinal = [];
    let custoTotal = 0;
    const disponibilidadeTemp = new Map(transportesOrdenados.map(t => [t.id, t.quantidadeDisponivel]));

    // 2. Algoritmo Guloso Principal (preencher com os mais eficientes)
    for (const transporte of transportesOrdenados) {
        if (pessoasRestantes <= 0) break;
        if (transporte.assentos <= 0) continue; // Ignora transporte sem assentos

        const disponivel = disponibilidadeTemp.get(transporte.id) || 0;
        if (disponivel <= 0) continue; // Pula se não houver mais deste tipo

        // Quantos deste tipo precisamos/podemos usar?
        const maxNecessarios = Math.ceil(pessoasRestantes / transporte.assentos);
        const usar = Math.min(maxNecessarios, disponivel); // Usa o mínimo entre o necessário e o disponível

        alocacaoFinal.push({
            transporteId: transporte.id,
            nome: transporte.nome,
            assentos: transporte.assentos,
            quantidadeUsada: usar
        });
        custoTotal += usar * transporte.custoAluguel;
        pessoasRestantes -= usar * transporte.assentos;
        disponibilidadeTemp.set(transporte.id, disponivel - usar); // Atualiza disponibilidade temporária
    }

    if (pessoasRestantes > 0) {
        console.warn(`Alocação falhou: Faltaram ${pessoasRestantes} assentos.`);
        return null; // Não foi possível alocar todos
    }

    return { alocacao: alocacaoFinal, custoTotal };
}



// ROTAS DE USUÁRIOS (Cliente Final)


// Rota para registrar dados adicionais de um usuário após autenticação Firebase
app.post("/register", verificarAutenticacao, async (req, res) => { 
    const { uid } = req.user; // Pega o UID do token verificado
    const { nome, email, telefone, idade } = req.body;

    if (email !== req.user.email) {
         return res.status(400).json({ error: "O email fornecido não corresponde ao usuário autenticado." });
    }

    const erroValidacao = validarDadosCadastro(nome, email, telefone, idade);
    if (erroValidacao) {
        return res.status(400).json({ error: erroValidacao });
    }

    try {
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {

             await userRef.update({
                 nome,
                 telefone,
                 idade: parseInt(idade, 10),
                 lastUpdate: admin.firestore.FieldValue.serverTimestamp()
             });
             res.status(200).json({ message: "Dados do usuário atualizados com sucesso!" });
        } else {
            await userRef.set({
                nome,
                email, 
                telefone,
                idade: parseInt(idade, 10),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.status(201).json({ message: "Usuário registrado com sucesso!" });
        }
    } catch (error) {
        console.error("Erro ao salvar dados do usuário:", error);
        res.status(500).json({ error: "Erro interno ao registrar/atualizar usuário." });
    }
});

// Rota para buscar os dados de um usuário específico pelo UID
app.get("/user/:uid", verificarAutenticacao, async (req, res) => {
    const { uid } = req.params;

    if (req.user.uid !== uid && req.user.email !== process.env.ADMIN_EMAIL) {
         return res.status(403).json({ error: "Você não tem permissão para acessar estes dados." });
    }

    try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }
        res.status(200).json({ id: userDoc.id, ...userDoc.data() });
    } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
        res.status(500).json({ error: "Erro interno ao buscar dados do usuário." });
    }
});

// Rota para buscar todas as caravanas em que um usuário está registrado (qualquer status)
app.get('/usuario/:userId/caravanas', verificarAutenticacao, async (req, res) => {
    const { userId } = req.params;
    if (req.user.uid !== userId && req.user.email !== process.env.ADMIN_EMAIL) {
         return res.status(403).json({ error: "Acesso não autorizado." });
    }

    try {
        const caravanas = await getCaravanasUsuarioPorStatus(userId, undefined);
        res.status(200).json(caravanas);
    } catch (error) {
        console.error(`Erro na rota /usuario/${userId}/caravanas:`, error);
        res.status(500).json({ error: "Erro ao buscar caravanas do usuário." });
    }
});

// Rota para buscar as caravanas de um usuário filtradas por status
app.get('/usuario/:userId/caravanas/:status', verificarAutenticacao, async (req, res) => {
    const { userId, status } = req.params;

    if (req.user.uid !== userId && req.user.email !== process.env.ADMIN_EMAIL) {
         return res.status(403).json({ error: "Acesso não autorizado." });
    }

    const validStatuses = ['confirmada', 'nao_confirmada', 'cancelada'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Use um de: ${validStatuses.join(', ')}.` });
    }

    try {
        const caravanas = await getCaravanasUsuarioPorStatus(userId, status);
        res.status(200).json(caravanas);
    } catch (error) {
        console.error(`Erro na rota /usuario/${userId}/caravanas/${status}:`, error);
        res.status(500).json({ error: "Erro ao buscar caravanas do usuário por status." });
    }
});

async function getCaravanasUsuarioPorStatus(userId, status = undefined) {
    try {
        const maxCapacidadeDisponivel = await getMaxCapacidadeTransporteDisponivel();
        const participantesSnapshot = await db.collection('participantes').where('uid', '==', userId).get();
        if (participantesSnapshot.empty) return [];
        const caravanasInfoUsuario = {};
        participantesSnapshot.forEach(doc => {
            const p = doc.data(); const cId = p.caravanaId; const qtd = parseInt(p.quantidade, 10) || 0;
            if (!caravanasInfoUsuario[cId]) caravanasInfoUsuario[cId] = { id: cId, quantidadeTotalUsuario: 0 };
            caravanasInfoUsuario[cId].quantidadeTotalUsuario += qtd;
        });
        const caravanasIds = Object.keys(caravanasInfoUsuario);
        if (caravanasIds.length === 0) return [];

        let caravanasQuery = db.collection('caravanas').where(admin.firestore.FieldPath.documentId(), 'in', caravanasIds);
        if (status && ['confirmada', 'nao_confirmada', 'cancelada', 'concluida'].includes(status)) {
            caravanasQuery = caravanasQuery.where('status', '==', status);
        }
        const caravanasSnapshot = await caravanasQuery.get();
        const caravanasPromises = caravanasSnapshot.docs.map(async (doc) => {
            const caravana = doc.data(); const caravanaId = doc.id;
            const [localidadeData, adminData, motoristaData, guiaData] = await Promise.all([
                getLocalidadeData(caravana.localidadeId), getFuncionarioData(caravana.administradorUid),
                getFuncionarioData(caravana.motoristaUid), getFuncionarioData(caravana.guiaUid)
            ]);
            const metrics = calculateCaravanaMetrics(caravana);
            return {
                id: caravanaId, ...caravana, ...localidadeData, ...metrics,
                administrador: adminData, motorista: motoristaData, guia: guiaData,
                quantidadeTotalUsuario: caravanasInfoUsuario[caravanaId]?.quantidadeTotalUsuario || 0,
                maxCapacidadeDisponivel: maxCapacidadeDisponivel
            };
        });
        let caravanas = await Promise.all(caravanasPromises);
        caravanas.sort((a, b) => new Date(b.data) - new Date(a.data));
        return caravanas;
    } catch (error) { console.error(error); throw error; }
}





// ROTAS DE FUNCIONÁRIOS (ADMIN/INTERNO) - Necessitarão de revisão de permissões

app.post('/funcionarios', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { nome, email, telefone, senha, cargo, salario, fotoUrl } = req.body;

        if (!nome || !email || !telefone || !senha || !cargo || salario === undefined || salario === null || salario === '') {
            return res.status(400).json({ error: "Campos nome, email, telefone, senha, cargo e salário são obrigatórios." });
        }
        if (!['motorista', 'administrador', 'guia'].includes(cargo)) {
             return res.status(400).json({ error: "Cargo inválido." });
        }
        if (senha.length < 6) {
            return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Formato de email inválido." });
        }
        const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(telefone)) {
            return res.status(400).json({ error: "Formato de telefone inválido." });
        }

        const salarioNum = parseFloat(salario);
        if (isNaN(salarioNum) || salarioNum < 0) {
            return res.status(400).json({ error: "Salário inválido." });
        }

        const userRecord = await admin.auth().createUser({
            email: email,
            password: senha,
            displayName: nome,
            // photoURL: fotoUrl || null // Poderia adicionar aqui se quisesse na Auth também
        });

        const novoFuncionarioFirestore = {
            nome,
            email,
            telefone,
            cargo,
            salario: salarioNum,
            fotoUrl: fotoUrl || null,
            uid: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = db.collection('funcionarios').doc(userRecord.uid);
        await docRef.set(novoFuncionarioFirestore);

        res.status(201).json({ id: userRecord.uid, ...novoFuncionarioFirestore });

    } catch (error) {
        console.error('Erro ao criar funcionário:', error);
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: 'Este email já está em uso.' });
        }
        const errorMessage = error.message ? error.message.replace(/"[^"]*"/g, '"***"') : 'Erro interno ao criar funcionário.';
        res.status(500).json({ error: errorMessage, code: error.code });
    }
});


app.put('/funcionarios/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, cargo, salario, fotoUrl } = req.body;

        const funcionarioRef = db.collection('funcionarios').doc(id);
        const funcDoc = await funcionarioRef.get();

        if (!funcDoc.exists) {
            return res.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        const dadosAtuais = funcDoc.data();

        const funcionarioAtualizado = {};

        if (nome !== undefined) funcionarioAtualizado.nome = nome;
        if (email !== undefined) funcionarioAtualizado.email = email;
        if (telefone !== undefined) {
            const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
            if (!phoneRegex.test(telefone)) return res.status(400).json({ error: "Formato de telefone inválido." });
            funcionarioAtualizado.telefone = telefone;
        }
        if (cargo !== undefined) {
            if (!['motorista', 'administrador', 'guia'].includes(cargo)) return res.status(400).json({ error: "Cargo inválido." });
            funcionarioAtualizado.cargo = cargo;
        }
        if (salario !== undefined) {
             if (salario === null || salario === '') {
                  return res.status(400).json({ error: "Salário não pode ser vazio." });
             }
             const salarioNum = parseFloat(salario);
             if (isNaN(salarioNum) || salarioNum < 0) {
                 return res.status(400).json({ error: "Salário inválido." });
             }
             funcionarioAtualizado.salario = salarioNum;
        }
        if (fotoUrl !== undefined) {
            funcionarioAtualizado.fotoUrl = fotoUrl;
        }

        funcionarioAtualizado.lastUpdate = admin.firestore.FieldValue.serverTimestamp();

        if (Object.keys(funcionarioAtualizado).length <= 1) {
            return res.status(400).json({ error: "Nenhum dado para atualizar foi fornecido." });
        }

        await funcionarioRef.update(funcionarioAtualizado);

        try {
             const authUpdates = {};
             const finalEmail = funcionarioAtualizado.email !== undefined ? funcionarioAtualizado.email : dadosAtuais.email;
             const finalNome = funcionarioAtualizado.nome !== undefined ? funcionarioAtualizado.nome : dadosAtuais.nome;
             // const finalFotoUrl = funcionarioAtualizado.fotoUrl !== undefined ? funcionarioAtualizado.fotoUrl : dadosAtuais.fotoUrl; // Descomente se quiser atualizar Auth photoURL

             if (finalEmail !== dadosAtuais.email) authUpdates.email = finalEmail;
             if (finalNome !== dadosAtuais.nome) authUpdates.displayName = finalNome;
             // if (finalFotoUrl !== dadosAtuais.fotoUrl) authUpdates.photoURL = finalFotoUrl; // Descomente se quiser atualizar Auth photoURL

             if (Object.keys(authUpdates).length > 0) {
                 await admin.auth().updateUser(id, authUpdates);
             }
        } catch (authError) {
             console.error("Erro ao atualizar dados no Firebase Auth (continuando após salvar no Firestore):", authError);
             // Retorna sucesso parcial, informando o erro do Auth
              const updatedDocPartial = await funcionarioRef.get(); // Pega dados do Firestore
             return res.status(200).json({
                 message: 'Funcionário atualizado no banco de dados, mas houve um erro ao atualizar dados na autenticação.',
                 details: authError.message,
                 data: updatedDocPartial.data() // Retorna dados do Firestore
                });
        }

        const updatedDoc = await funcionarioRef.get();
        res.status(200).json({ message: 'Funcionário atualizado com sucesso.', data: updatedDoc.data() });

    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar funcionário.', details: error.message });
    }
});

// Rota para listar todos os funcionários (requer admin ou outra permissão)
app.get('/funcionarios', verificarAutenticacao, verificarAdmin, async (req, res) => { 
    try {
        const snapshot = await db.collection('funcionarios').get();
        const funcionarios = [];
        snapshot.forEach(doc => {
            funcionarios.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(funcionarios);
    } catch (error) {
        console.error("Erro ao listar funcionários:", error);
        res.status(500).json({ error: "Erro interno ao listar funcionários." });
    }
});

app.get('/funcionarios/:uid', verificarAutenticacao, async (req, res) => {
    const requestedUid = req.params.uid; // UID vindo da URL
    const loggedInUserUid = req.user.uid; // UID do usuário logado (do token)

    // Opcional: Verificar permissão - Permitir que o próprio funcionário ou o admin geral vejam os dados
    if (requestedUid !== loggedInUserUid && req.user.email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ error: "Acesso não autorizado para visualizar dados deste funcionário." });
    }

    try {
        // Usa a função helper que já foi corrigida para buscar pelo CAMPO 'uid'
        const funcionarioData = await getFuncionarioData(requestedUid);

        if (funcionarioData && !funcionarioData.error) {
            // Se encontrou o funcionário, retorna os dados
            res.status(200).json(funcionarioData);
        } else {
            // Se getFuncionarioData retornou null ou um objeto com erro
            res.status(404).json({ error: `Funcionário com UID ${requestedUid} não encontrado.` });
        }
    } catch (error) {
        // Erro inesperado durante o processo
        console.error(`Erro ao buscar funcionário por UID ${requestedUid}:`, error);
        res.status(500).json({ error: 'Erro interno ao buscar dados do funcionário.' });
    }
});

// Rota para excluir um funcionário (requer admin)
app.delete('/funcionarios/:id', verificarAutenticacao, verificarAdmin, async (req, res) => { 
    try {
        const { id } = req.params; 

        const funcionariosRef = db.collection('funcionarios').doc(id);
        const funcDoc = await funcionariosRef.get();
        if (!funcDoc.exists) {
            return res.status(404).json({ error: 'Funcionário não encontrado no Firestore.' });
        }
        await funcionariosRef.delete();

        try {
             await admin.auth().deleteUser(id);
        } catch (authError) {
             console.error("Erro ao excluir usuário do Firebase Auth:", authError);
             return res.status(207).json({ message: "Funcionário excluído do banco de dados, mas falha ao excluir da autenticação.", details: authError.message });
        }

        res.status(200).json({ message: "Funcionário excluído com sucesso (Firestore e Auth)." });

    } catch (error) {
        console.error("Erro ao excluir funcionário:", error);
        res.status(500).json({ error: "Erro interno ao excluir funcionário." });
    }
});

// server.js - Adicionar/Substituir esta rota

app.get('/funcionarios/:uid/caravanas', verificarAutenticacao, async (req, res) => {
    const { uid } = req.params; const loggedInUserUid = req.user.uid;
    if (uid !== loggedInUserUid && req.user.email !== process.env.ADMIN_EMAIL) { return res.status(403).json({ error: "Acesso não autorizado." }); }
    try {
        const maxCapacidadeDisponivel = await getMaxCapacidadeTransporteDisponivel();
        const adminQuery = db.collection('caravanas').where('administradorUid', '==', uid);
        const motoristaQuery = db.collection('caravanas').where('motoristaUid', '==', uid);
        const guiaQuery = db.collection('caravanas').where('guiaUid', '==', uid);
        const [adminSnap, motoristaSnap, guiaSnap] = await Promise.all([ adminQuery.get(), motoristaQuery.get(), guiaQuery.get() ]);
        const caravanasMap = new Map();
        adminSnap.forEach(doc => caravanasMap.set(doc.id, doc.data()));
        motoristaSnap.forEach(doc => caravanasMap.set(doc.id, doc.data()));
        guiaSnap.forEach(doc => caravanasMap.set(doc.id, doc.data()));
        if (caravanasMap.size === 0) return res.status(200).json([]);

        const caravanasPromises = Array.from(caravanasMap.entries()).map(async ([id, caravanaData]) => {
            const [localidadeData, adminFunc, motoristaFunc, guiaFunc] = await Promise.all([
                 getLocalidadeData(caravanaData.localidadeId), getFuncionarioData(caravanaData.administradorUid),
                 getFuncionarioData(caravanaData.motoristaUid), getFuncionarioData(caravanaData.guiaUid) ]);
            const metrics = calculateCaravanaMetrics({ id, ...caravanaData });
            return {
                id: id, ...caravanaData, ...localidadeData, ...metrics,
                administrador: adminFunc, motorista: motoristaFunc, guia: guiaFunc,
                maxCapacidadeDisponivel: maxCapacidadeDisponivel
            };
        });
        let caravanas = await Promise.all(caravanasPromises);
        caravanas.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.status(200).json(caravanas);
    } catch (error) { console.error(error); res.status(500).json({ error: 'Erro interno.' }); }
});





// ROTAS DE CARAVANAS
// post /caravana
app.post('/caravanas', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const {
            localidadeId, data, horarioSaida, despesas, lucroAbsoluto, ocupacaoMinima, preco,
            administradorUid, motoristaUid, guiaUid, dataConfirmacaoTransporte, dataFechamentoVendas
        } = req.body;

        if (!localidadeId || !data || !despesas || !lucroAbsoluto || !ocupacaoMinima || preco === undefined || preco === null || preco === '' || !dataConfirmacaoTransporte) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios (Localidade, Datas, Cálculos, Preço)." });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: "Formato Data Viagem inválido."});
        if (dataConfirmacaoTransporte && !/^\d{4}-\d{2}-\d{2}$/.test(dataConfirmacaoTransporte)) return res.status(400).json({ error: "Formato Data Conf. Transporte inválido."});
        if (dataFechamentoVendas && !/^\d{4}-\d{2}-\d{2}$/.test(dataFechamentoVendas)) return res.status(400).json({ error: "Formato Data Fech. Vendas inválido."});

        const dtViagem = new Date(data + 'T00:00:00');
        const dtConfTransp = dataConfirmacaoTransporte ? new Date(dataConfirmacaoTransporte + 'T00:00:00') : null;
        const dtFechVendas = dataFechamentoVendas ? new Date(dataFechamentoVendas + 'T00:00:00') : null;

        if(dtConfTransp && dtFechVendas && dtConfTransp > dtFechVendas) return res.status(400).json({ error: "Data Conf. Transporte > Fechamento." });
        if(dtFechVendas && dtViagem && dtFechVendas > dtViagem) return res.status(400).json({ error: "Data Fechamento > Viagem." });
        if(dtConfTransp && dtViagem && dtConfTransp > dtViagem) return res.status(400).json({ error: "Data Conf. Transporte > Viagem." });

        const localidadeRef = db.collection('localidades').doc(localidadeId);
        const localidadeDoc = await localidadeRef.get();
        if (!localidadeDoc.exists) return res.status(404).json({ error: 'Localidade não encontrada.' });

        const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10) || 0;
        const precoNum = parseFloat(preco);
        if (isNaN(precoNum) || precoNum < 0) return res.status(400).json({ error: "Preço inválido." });

        const novaCaravana = {
            localidadeId, data, horarioSaida: horarioSaida || null,
            vagasTotais: ocupacaoMinimaNum,
            vagasDisponiveis: ocupacaoMinimaNum,
            despesas: parseFloat(despesas) || 0, lucroAbsoluto: parseFloat(lucroAbsoluto) || 0,
            ocupacaoMinima: ocupacaoMinimaNum, preco: precoNum,
            status: "nao_confirmada",
            administradorUid: administradorUid === "nao_confirmado" ? null : administradorUid,
            motoristaUid: motoristaUid === "nao_confirmado" ? null : motoristaUid,
            guiaUid: (guiaUid === "nao_confirmado" || guiaUid === "") ? null : guiaUid,
            dataConfirmacaoTransporte: dataConfirmacaoTransporte,
            dataFechamentoVendas: dataFechamentoVendas || null,
            transporteAlocado: null,
            transporteConfirmado: false, // Adicionado para controle
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('caravanas').add(novaCaravana);
        res.status(201).json({ id: docRef.id, ...novaCaravana });
    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno.", details: error.message }); }
});


app.put('/caravanas/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        localidadeId, data, horarioSaida, despesas, lucroAbsoluto, ocupacaoMinima, preco,
        administradorUid, motoristaUid, guiaUid, dataConfirmacaoTransporte, dataFechamentoVendas
    } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();
        if (!caravanaDoc.exists) { return res.status(404).json({ error: 'Caravana não encontrada.' }); }
        const caravanaAtual = caravanaDoc.data();

        if (!localidadeId || !data || !despesas || !lucroAbsoluto || !ocupacaoMinima || !dataConfirmacaoTransporte) {
             return res.status(400).json({ error: "Campos básicos e data conf. transporte obrigatórios." });
         }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: "Formato Data Viagem inválido."});
        if (dataConfirmacaoTransporte && !/^\d{4}-\d{2}-\d{2}$/.test(dataConfirmacaoTransporte)) return res.status(400).json({ error: "Formato Data Conf. Transporte inválido."});
        if (dataFechamentoVendas !== undefined && dataFechamentoVendas !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dataFechamentoVendas)) return res.status(400).json({ error: "Formato Data Fech. Vendas inválido." });

        const dtViagemFinal = new Date(data + 'T00:00:00');
        const dtConfTranspFinal = dataConfirmacaoTransporte ? new Date(dataConfirmacaoTransporte + 'T00:00:00') : null;
        const dtFechVendasFinal = dataFechamentoVendas ? new Date(dataFechamentoVendas + 'T00:00:00') : null;

        if(dtConfTranspFinal && dtFechVendasFinal && dtConfTranspFinal > dtFechVendasFinal) return res.status(400).json({ error: "Data Conf. Transporte > Fechamento." });
        if(dtFechVendasFinal && dtViagemFinal && dtFechVendasFinal > dtViagemFinal) return res.status(400).json({ error: "Data Fechamento > Viagem." });
        if(dtConfTranspFinal && dtViagemFinal && dtConfTranspFinal > dtViagemFinal) return res.status(400).json({ error: "Data Conf. Transporte > Viagem." });

        if (localidadeId && localidadeId !== caravanaAtual.localidadeId) {
             const locCheck = await db.collection('localidades').doc(localidadeId).get();
             if (!locCheck.exists) return res.status(404).json({ error: 'Nova localidade não encontrada.' });
        }

        const dadosAtualizados = {};
        if (localidadeId !== undefined) dadosAtualizados.localidadeId = localidadeId;
        if (data !== undefined) dadosAtualizados.data = data;
        if (horarioSaida !== undefined) dadosAtualizados.horarioSaida = horarioSaida || null;
        if (despesas !== undefined) dadosAtualizados.despesas = parseFloat(despesas) || 0;
        if (lucroAbsoluto !== undefined) dadosAtualizados.lucroAbsoluto = parseFloat(lucroAbsoluto) || 0;
        if (ocupacaoMinima !== undefined) dadosAtualizados.ocupacaoMinima = parseInt(ocupacaoMinima, 10) || 0;
        if (preco !== undefined) {
            const precoNum = parseFloat(preco);
             if (isNaN(precoNum) || precoNum < 0) {
                 return res.status(400).json({ error: "Preço inválido." });
             }
             dadosAtualizados.preco = precoNum;
         }
        if (administradorUid !== undefined) dadosAtualizados.administradorUid = administradorUid === "nao_confirmado" ? null : administradorUid;
        if (motoristaUid !== undefined) dadosAtualizados.motoristaUid = motoristaUid === "nao_confirmado" ? null : motoristaUid;
        if (guiaUid !== undefined) dadosAtualizados.guiaUid = (guiaUid === "nao_confirmado" || guiaUid === "") ? null : guiaUid;
        if (dataConfirmacaoTransporte !== undefined) dadosAtualizados.dataConfirmacaoTransporte = dataConfirmacaoTransporte || null;
        if (dataFechamentoVendas !== undefined) dadosAtualizados.dataFechamentoVendas = dataFechamentoVendas || null;

        if (Object.keys(dadosAtualizados).length > 0) {
            dadosAtualizados.lastUpdate = admin.firestore.FieldValue.serverTimestamp();
            await caravanaRef.update(dadosAtualizados);
        } else {
             console.log(`Nenhum campo alterado para caravana ${id}, exceto timestamp.`);
             await caravanaRef.update({ lastUpdate: admin.firestore.FieldValue.serverTimestamp() });
        }

        const caravanaAtualizadaDoc = await caravanaRef.get();
        const cData = caravanaAtualizadaDoc.data();
        const [adminData, motoristaData, guiaData] = await Promise.all([
             getFuncionarioData(cData.administradorUid),
             getFuncionarioData(cData.motoristaUid),
             getFuncionarioData(cData.guiaUid)
        ]);
        const metrics = calculateCaravanaMetrics(cData);
        const locData = await getLocalidadeData(cData.localidadeId);
        const maxCapacidade = await getMaxCapacidadeTransporteDisponivel();
        res.status(200).json({
             id: caravanaAtualizadaDoc.id, ...cData, ...locData, ...metrics,
             administrador: adminData, motorista: motoristaData, guia: guiaData,
             maxCapacidadeDisponivel: maxCapacidade
        });

    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno.", details: error.message }); }
});



// --- Rota PUT /caravanas/:id/definir-transporte (Adiciona checagem de data) ---
app.put('/caravanas/:id/definir-transporte', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    const { transporteId, placa } = req.body;

    if (!transporteId || !placa) return res.status(400).json({ error: "ID do tipo e placa obrigatórios." });

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        const transporteRef = db.collection('transportes').doc(transporteId);

        await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");
            const caravanaData = caravanaDoc.data();

            // <<< NOVA VALIDAÇÃO DE DATA >>>
            const hoje = new Date();
            const dataConfirmacao = caravanaData.dataConfirmacaoTransporte ? new Date(caravanaData.dataConfirmacaoTransporte + 'T00:00:00') : null;
            if (!dataConfirmacao) throw new Error("Data de confirmação do transporte não definida para esta caravana.");
            if (hoje < dataConfirmacao) {
                throw new Error(`A definição manual do transporte só é permitida a partir de ${formatDate(caravanaData.dataConfirmacaoTransporte)}.`);
            }
            // <<< FIM VALIDAÇÃO DE DATA >>>

            if (caravanaData.status !== 'confirmada') throw new Error("Só definir transporte para caravanas confirmadas.");

            const transporteDoc = await transaction.get(transporteRef);
            if (!transporteDoc.exists) throw new Error("Tipo de transporte não encontrado.");
            const transporteData = transporteDoc.data();

            const participantesQuery = db.collection('participantes').where('caravanaId', '==', caravanaId);
            const participantesSnapTrans = await transaction.get(participantesQuery);
            let vagasOcupadasAtuais = 0;
            participantesSnapTrans.forEach(pDoc => { vagasOcupadasAtuais += parseInt(pDoc.data().quantidade, 10) || 0; });
            if (caravanaData.administradorUid) vagasOcupadasAtuais += 1;
            const capacidadeAlocada = transporteData.assentos || 0;
            if (capacidadeAlocada < vagasOcupadasAtuais) throw new Error(`Transporte (${capacidadeAlocada}) não comporta ${vagasOcupadasAtuais} passageiros.`);

            const transporteAlocadoObj = { id: transporteId, nome: transporteData.nome, assentos: capacidadeAlocada, placa: placa, motoristaUid: null };
            transaction.update(caravanaRef, {
                 transportesAlocados: [transporteAlocadoObj], transporteConfirmado: true,
                 vagasTotais: capacidadeAlocada, vagasDisponiveis: Math.max(0, capacidadeAlocada - vagasOcupadasAtuais),
                 lastUpdate: admin.firestore.FieldValue.serverTimestamp()
             });
        });
         res.status(200).json({ message: "Transporte definido." });
    } catch (error) {
         console.error(error);
          if (error.message.includes("não encontrada")) res.status(404).json({ error: error.message });
          else if (error.message.includes("não comporta") || error.message.includes("Só é possível") || error.message.includes("definição manual")) res.status(400).json({ error: error.message });
          else res.status(500).json({ error: "Erro interno.", details: error.message });
    }
});

app.put('/caravanas/:id/definir-transporte', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    const { transporteId, placa } = req.body;
    if (!transporteId || !placa) return res.status(400).json({ error: "ID do tipo e placa são obrigatórios." });
    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        const transporteRef = db.collection('transportes').doc(transporteId);
        await db.runTransaction(async (transaction) => {
            const [caravanaDoc, transporteDoc] = await Promise.all([ transaction.get(caravanaRef), transaction.get(transporteRef) ]);
            if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");
            if (!transporteDoc.exists) throw new Error("Tipo de transporte não encontrado.");
            const caravanaData = caravanaDoc.data(); const transporteData = transporteDoc.data();
            if (caravanaData.status !== 'confirmada') throw new Error("Só é possível definir transporte para caravanas confirmadas.");

            const participantesQuery = db.collection('participantes').where('caravanaId', '==', caravanaId);
            const participantesSnapTrans = await transaction.get(participantesQuery);
            let vagasOcupadasAtuais = 0;
            participantesSnapTrans.forEach(pDoc => { vagasOcupadasAtuais += parseInt(pDoc.data().quantidade, 10) || 0; });
            if (caravanaData.administradorUid) vagasOcupadasAtuais += 1;
            const capacidadeAlocada = transporteData.assentos || 0;
            if (capacidadeAlocada < vagasOcupadasAtuais) throw new Error(`Transporte (${capacidadeAlocada} assentos) não comporta ${vagasOcupadasAtuais} passageiros.`);

            const transporteAlocadoObj = { id: transporteId, nome: transporteData.nome, assentos: capacidadeAlocada, placa: placa, motoristaUid: null };
            transaction.update(caravanaRef, {
                 transportesAlocados: [transporteAlocadoObj], transporteConfirmado: true,
                 vagasTotais: capacidadeAlocada, vagasDisponiveis: Math.max(0, capacidadeAlocada - vagasOcupadasAtuais),
                 lastUpdate: admin.firestore.FieldValue.serverTimestamp()
             });
        });
         res.status(200).json({ message: "Transporte definido com sucesso." });
    } catch (error) {
         console.error(error);
          if (error.message.includes("não encontrada")) res.status(404).json({ error: error.message });
          else if (error.message.includes("não comporta")) res.status(400).json({ error: error.message });
          else if (error.message.includes("Só é possível")) res.status(400).json({ error: error.message });
          else res.status(500).json({ error: "Erro interno.", details: error.message });
    }
});

app.put('/caravanas/:id/definir-placa-motorista', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    const { placa, motoristaUid } = req.body; // Recebe placa e UID opcional do motorista

    if (!placa && motoristaUid === undefined) { // Precisa de pelo menos um
        return res.status(400).json({ error: "Placa ou Motorista UID necessário." });
    }

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        await db.runTransaction(async (transaction) => {
             const caravanaDoc = await transaction.get(caravanaRef);
             if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");
             const caravanaData = caravanaDoc.data();
             if (!caravanaData.transporteAlocado) throw new Error("Transporte ainda não alocado para esta caravana.");

             const transporteAlocadoAtual = { ...caravanaData.transporteAlocado }; // Copia objeto

             // Atualiza a placa se fornecida
             if (placa !== undefined) {
                 if (!placa) throw new Error("Placa não pode ser vazia.");
                 transporteAlocadoAtual.placa = placa;
             }

              // Atualiza o motorista se fornecido
             if (motoristaUid !== undefined) {
                 if (motoristaUid !== null) { // Valida se não for para remover
                      const motoristaDoc = await getFuncionarioData(motoristaUid);
                      if (!motoristaDoc || motoristaDoc.cargo !== 'motorista') throw new Error("Motorista inválido ou não encontrado.");
                 }
                 transporteAlocadoAtual.motoristaUid = motoristaUid; // Atualiza ou remove (se null)
             }

              // Salva o objeto transporteAlocado modificado
              transaction.update(caravanaRef, {
                 transporteAlocado: transporteAlocadoAtual,
                 lastUpdate: admin.firestore.FieldValue.serverTimestamp()
              });
        });
         res.status(200).json({ message: "Detalhes do transporte atualizados." });
    } catch (error) {
         console.error(error);
         if (error.message.includes("não encontrada")) res.status(404).json({ error: error.message });
         else if (error.message.includes("não alocado") || error.message.includes("inválido")) res.status(400).json({ error: error.message });
         else res.status(500).json({ error: "Erro interno.", details: error.message });
    }
});



// --- Rota GET /caravanas ATUALIZADA ---
app.get("/caravanas", async (req, res) => {
    try {
        const maxCapacidadeDisponivel = await getMaxCapacidadeTransporteDisponivel();
        let caravanasQuery = db.collection("caravanas");
        const { sortBy, status } = req.query;
        if (status && ['confirmada', 'nao_confirmada', 'cancelada', 'concluida'].includes(status)) {
            caravanasQuery = caravanasQuery.where("status", "==", status);
        }
        if (sortBy === 'data_asc') caravanasQuery = caravanasQuery.orderBy('data', 'asc');
        else if (sortBy === 'data_desc') caravanasQuery = caravanasQuery.orderBy('data', 'desc');
        else if (sortBy === 'preco_asc') caravanasQuery = caravanasQuery.orderBy('preco', 'asc');
        else if (sortBy === 'preco_desc') caravanasQuery = caravanasQuery.orderBy('preco', 'desc');
        else caravanasQuery = caravanasQuery.orderBy('status', 'asc').orderBy('data', 'asc');

        const caravanasSnapshot = await caravanasQuery.get();
        const caravanasPromises = caravanasSnapshot.docs.map(async (doc) => {
            const caravana = doc.data();
            const [localidadeData, adminData, motoristaData, guiaData] = await Promise.all([
                 getLocalidadeData(caravana.localidadeId),
                 getFuncionarioData(caravana.administradorUid),
                 getFuncionarioData(caravana.motoristaUid),
                 getFuncionarioData(caravana.guiaUid)
            ]);
            const metrics = calculateCaravanaMetrics(caravana);
            return {
                id: doc.id, ...caravana, ...localidadeData, ...metrics,
                administrador: adminData, motorista: motoristaData, guia: guiaData,
                maxCapacidadeDisponivel: maxCapacidadeDisponivel
            };
        });
        let caravanas = await Promise.all(caravanasPromises);
        if (sortBy === 'roi_desc') caravanas.sort((a, b) => (b.roi || 0) - (a.roi || 0));
        else if (sortBy === 'lucro_max_desc') caravanas.sort((a, b) => (b.lucroMaximo || 0) - (a.lucroMaximo || 0));
        else if (sortBy === 'ocupacao_desc') {
             const now = Date.now();
             caravanas.sort((a, b) => {
                const aFuture = new Date(a.data).getTime() > now;
                const bFuture = new Date(b.data).getTime() > now;
                if (aFuture !== bFuture) return aFuture ? -1 : 1;
                const ocupacaoA = a.vagasTotais > 0 ? (a.vagasOcupadas / a.vagasTotais) : 0;
                const ocupacaoB = b.vagasTotais > 0 ? (b.vagasOcupadas / b.vagasTotais) : 0;
                return ocupacaoB - ocupacaoA;
            });
        }
        res.status(200).json(caravanas);
    } catch (error) { console.error("Erro ao buscar caravanas:", error); res.status(500).json({ error: "Erro interno." }); }
});


// --- Rota GET /caravanas/:id ATUALIZADA ---
app.get("/caravanas/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const caravanaDoc = await db.collection("caravanas").doc(id).get();
        if (!caravanaDoc.exists) return res.status(404).json({ error: "Caravana não encontrada." });
        const caravana = caravanaDoc.data();
        const [localidadeData, adminData, motoristaData, guiaData] = await Promise.all([
            getLocalidadeData(caravana.localidadeId), getFuncionarioData(caravana.administradorUid),
            getFuncionarioData(caravana.motoristaUid), getFuncionarioData(caravana.guiaUid) ]);
        const metrics = calculateCaravanaMetrics(caravana);
        res.status(200).json({
            id: caravanaDoc.id, ...caravana, ...localidadeData, ...metrics,
            administrador: adminData, motorista: motoristaData, guia: guiaData,
             // transportesAlocados já está em 'caravana'
        });
    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno." }); }
});





// Rota para excluir uma caravana (requer admin) - CUIDADO: irreversível
app.delete("/caravanas/:id", verificarAutenticacao,verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const caravanaRef = db.collection("caravanas").doc(id);
        const caravanaDoc = await caravanaRef.get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: "Caravana não encontrada." });
        }
        const participantesSnapshot = await db.collection("participantes").where("caravanaId", "==", id).limit(1).get();
        if (!participantesSnapshot.empty) {
              console.warn(`Excluindo caravana ${id} que possui participantes.`);
              const participantesNotificar = await buscarParticipantesParaNotificacao(id);
               if (participantesNotificar.length > 0) {
                  const caravanaData = caravanaDoc.data();
                  const localidadeData = await getLocalidadeData(caravanaData.localidadeId);
                  const nomeLocalidade = localidadeData.nomeLocalidade || caravanaData.localidadeId;
                  const subject = `Caravana para ${nomeLocalidade} Excluída Permanentemente`;
                  const html = `<p>A caravana para ${nomeLocalidade} em ${formatDate(caravanaData.data)} foi excluída permanentemente. Entre em contato para mais informações.</p>`;
                  for (const p of participantesNotificar) { await sendEmail(p.email, subject, html); }
               }
        }
         const batch = db.batch();
         const participantesParaExcluirSnapshot = await db.collection("participantes").where("caravanaId", "==", id).get();
         participantesParaExcluirSnapshot.forEach(doc => batch.delete(doc.ref));
         await batch.commit();
         console.log(`Excluídos ${participantesParaExcluirSnapshot.size} registros de participantes para a caravana ${id}.`);


        await caravanaRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error(`Erro ao excluir caravana ${id}:`, error);
        res.status(500).json({ error: "Erro interno ao excluir caravana.", details: error.message });
    }
});

// Rota para cancelar uma caravana (requer admin)
app.put('/cancelar-caravana/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body; 

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        const caravana = caravanaDoc.data();

        if (caravana.status === 'cancelada') {
            return res.status(400).json({ error: 'A caravana já está cancelada.' });
        }

        await caravanaRef.update({
            status: 'cancelada',
            motivoCancelamento: motivo || 'Cancelada pelo administrador.',
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        });
        const participantesNotificar = await buscarParticipantesParaNotificacao(id);
        if (participantesNotificar.length > 0) {
            const localidadeData = await getLocalidadeData(caravana.localidadeId);
            const nomeLocalidade = localidadeData.nomeLocalidade || caravana.localidadeId;
            const emailSubject = `Caravana para ${nomeLocalidade} Cancelada`;
            const emailHtml = `
              <p>Olá!</p>
              <p>Informamos que a caravana para <strong>${nomeLocalidade}</strong> marcada para ${formatDate(caravana.data)} foi cancelada.</p>
              ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
              <p>Entendemos que isso pode causar inconvenientes. Por favor, entre em contato conosco para discutir opções de reembolso ou realocação, se aplicável.</p>
              <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
            `;

            for (const participante of participantesNotificar) {
                await sendEmail(participante.email, emailSubject, emailHtml);
            }
        }

        res.status(200).json({ message: 'Caravana cancelada com sucesso e participantes notificados.' });

    } catch (error) {
        console.error(`Erro ao cancelar caravana ${id}:`, error);
        res.status(500).json({ error: "Erro interno ao cancelar caravana.", details: error.message });
    }
});

app.put('/caravanas/:caravanaId/alocar-motorista', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { caravanaId } = req.params;
    const { transporteId, motoristaUid } = req.body; // Recebe ID do transporte e UID do motorista

    if (!transporteId || motoristaUid === undefined) { // Permite motoristaUid ser null para desatribuir
        return res.status(400).json({ error: "ID do transporte e UID do motorista são necessários." });
    }

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);

        await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");

            const caravanaData = caravanaDoc.data();
            const transportes = caravanaData.transportesAlocados || [];

            // Encontra o índice do transporte a ser atualizado
            const transporteIndex = transportes.findIndex(t => t.id === transporteId);
            if (transporteIndex === -1) throw new Error("Transporte especificado não encontrado na alocação desta caravana.");

            // Opcional: Validar se o motoristaUid existe e é motorista
            if (motoristaUid !== null) {
                 const motoristaDoc = await getFuncionarioData(motoristaUid); // Usa a função helper
                 if (!motoristaDoc || motoristaDoc.cargo !== 'motorista') {
                      throw new Error("Motorista inválido ou não encontrado.");
                 }
            }

            // Atualiza o motoristaUid no transporte específico dentro do array
            transportes[transporteIndex].motoristaUid = motoristaUid; // Pode ser null para desatribuir

            // Atualiza o array inteiro no documento da caravana
            transaction.update(caravanaRef, { transportesAlocados: transportes });
        });

        res.status(200).json({ message: "Motorista alocado/desalocado com sucesso." });

    } catch (error) {
        console.error(`Erro ao alocar motorista para transporte ${transporteId} na caravana ${caravanaId}:`, error);
         if (error.message.includes("não encontrado")) {
             res.status(404).json({ error: error.message });
         } else if (error.message.includes("inválido")) {
             res.status(400).json({ error: error.message });
         } else {
             res.status(500).json({ error: "Erro interno ao alocar motorista.", details: error.message });
         }
    }
});

// --- NOVA ROTA: Alocação/Sobrescrita Manual de Transporte ---
app.put('/caravanas/:id/alocacao-manual', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    // Espera receber um array de IDs dos transportes selecionados manualmente
    const { transportesSelecionadosIds } = req.body;

    if (!Array.isArray(transportesSelecionadosIds)) {
        return res.status(400).json({ error: "Lista de IDs de transportes selecionados inválida." });
    }

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        const transportesRef = db.collection('transportes');

        await db.runTransaction(async (transaction) => {
             const caravanaDoc = await transaction.get(caravanaRef);
             if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");
             const caravanaData = caravanaDoc.data();

             const alocadosAnteriormente = caravanaData.transportesAlocados || [];
             const idsAlocadosAnteriormente = new Set(alocadosAnteriormente.map(t => t.id));
             const idsSelecionadosAgora = new Set(transportesSelecionadosIds);

             const transportesParaLiberar = alocadosAnteriormente.filter(t => !idsSelecionadosAgora.has(t.id));
             const transportesParaAlocar = transportesSelecionadosIds.filter(id => !idsAlocadosAnteriormente.has(id));

             // Busca detalhes dos novos transportes a alocar para validar e pegar info
             const novosTransportesData = [];
             if (transportesParaAlocar.length > 0) {
                 const novosTransportesSnap = await transaction.get(transportesRef.where(admin.firestore.FieldPath.documentId(), 'in', transportesParaAlocar));
                 if (novosTransportesSnap.size !== transportesParaAlocar.length) throw new Error("Um ou mais transportes selecionados não existem.");

                 novosTransportesSnap.forEach(doc => {
                     const data = doc.data();
                     if (!data.disponivel) throw new Error(`Transporte ${data.placa} não está disponível.`);
                     novosTransportesData.push({ id: doc.id, nome: data.nome, placa: data.placa, assentos: data.assentos, motoristaUid: null });
                 });
             }

             // Libera os que foram des-selecionados
             transportesParaLiberar.forEach(t => {
                  transaction.update(transportesRef.doc(t.id), { disponivel: true, caravanaAtualId: null, dataLiberacaoPrevista: null });
             });

              // Aloca os novos selecionados
              novosTransportesData.forEach(t => {
                   transaction.update(transportesRef.doc(t.id), { disponivel: false, caravanaAtualId: caravanaId, dataLiberacaoPrevista: caravanaData.data ? new Date(caravanaData.data + 'T23:59:59') : null }); // Salva data da viagem
              });

             // Atualiza a caravana
             const finalTransportesAlocados = [
                 ...alocadosAnteriormente.filter(t => idsSelecionadosAgora.has(t.id)), // Mantém os que já estavam e continuam
                 ...novosTransportesData // Adiciona os novos
             ];
              transaction.update(caravanaRef, {
                 transportesAlocados: finalTransportesAlocados,
                 transporteConfirmado: true, // Marca como confirmado
                 lastUpdate: admin.firestore.FieldValue.serverTimestamp()
              });
        });

         res.status(200).json({ message: "Alocação manual de transporte realizada com sucesso." });

    } catch (error) {
         console.error(`Erro na alocação manual para caravana ${caravanaId}:`, error);
          if (error.message.includes("não encontrado") || error.message.includes("não existem")) {
             res.status(404).json({ error: error.message });
         } else if (error.message.includes("não está disponível")) {
             res.status(409).json({ error: error.message }); // Conflict
         }
         else {
             res.status(500).json({ error: "Erro interno ao processar alocação manual.", details: error.message });
         }
    }
});


// ROTAS DE LOCALIDADES


// Rota para buscar todas as localidades
app.get('/localidades', async (req, res) => { 
    try {
        const localidadesSnapshot = await db.collection('localidades').orderBy('nome').get(); 
        const localidades = [];
        localidadesSnapshot.forEach(doc => {
            localidades.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(localidades);
    } catch (error) {
        console.error("Erro ao obter localidades:", error);
        res.status(500).json({ error: "Erro interno ao obter localidades." });
    }
});

// Rota para criar uma nova localidade (requer admin)
app.post('/localidades', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { nome, descricao, imagens } = req.body;

        if (!nome) {
            return res.status(400).json({ error: "O nome da localidade é obrigatório." });
        }
        if (imagens && !Array.isArray(imagens)) {
             return res.status(400).json({ error: "O campo 'imagens' deve ser um array de URLs." });
        }

        const novaLocalidadeRef = await db.collection('localidades').add({
            nome,
            descricao: descricao || null,
            imagens: imagens || [], 
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const novaLocalidade = await novaLocalidadeRef.get();
        res.status(201).json({ id: novaLocalidade.id, ...novaLocalidade.data() });
    } catch (error) {
        console.error("Erro ao criar localidade:", error);
        res.status(500).json({ error: `Erro interno ao criar localidade: ${error.message}` });
    }
});

// Rota para atualizar uma localidade (requer admin)
app.put('/localidades/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, imagens } = req.body;

    try {
        const localidadeRef = db.collection('localidades').doc(id);
        const localidadeDoc = await localidadeRef.get();

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        if (!nome) {
            return res.status(400).json({ error: 'O nome da localidade é obrigatório.' });
        }
        if (imagens && !Array.isArray(imagens)) {
             return res.status(400).json({ error: "O campo 'imagens' deve ser um array de URLs." });
        }

        await localidadeRef.update({
            nome,
            descricao: descricao !== undefined ? descricao : localidadeDoc.data().descricao, 
            imagens: imagens !== undefined ? imagens : localidadeDoc.data().imagens,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        });

        const localidadeAtualizada = await localidadeRef.get();
        res.status(200).json({ id: localidadeAtualizada.id, ...localidadeAtualizada.data() });
    }
    catch (error) {
        console.error(`Erro ao atualizar localidade ${id}:`, error);
        res.status(500).json({ error: `Erro interno ao atualizar localidade: ${error.message}` });
    }
});

// Rota para excluir uma localidade (requer admin) - CUIDADO: Verifique dependências
app.delete('/localidades/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const localidadeRef = db.collection('localidades').doc(id);
        const localidadeDoc = await localidadeRef.get();

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        const caravanasUsando = await db.collection('caravanas').where('localidadeId', '==', id).limit(1).get();
        if (!caravanasUsando.empty) {
            return res.status(400).json({ error: 'Não é possível excluir a localidade, pois ela está sendo usada por uma ou mais caravanas.' });
        }

        await localidadeRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error(`Erro ao excluir localidade ${id}:`, error);
        res.status(500).json({ error: `Erro interno ao excluir localidade: ${error.message}` });
    }
});

// Rota para buscar apenas a descrição de uma localidade (pode ser otimização)
app.get('/localidades/:id/descricao', async (req, res) => { 
    const { id } = req.params;
    try {
        const localidadeRef = db.collection('localidades').doc(id);
        const localidadeDoc = await localidadeRef.get({ fieldMask: ['descricao'] }); 

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        res.status(200).json({ descricao: localidadeDoc.data()?.descricao || null });
    } catch (error) {
        console.error(`Erro ao obter descrição da localidade ${id}:`, error);
        res.status(500).json({ error: "Erro interno ao obter descrição da localidade." });
    }
});






// ROTAS DE PARTICIPANTES E INGRESSOS


// server.js - Rota POST /comprar-ingresso COMPLETA E ATUALIZADA

app.post('/comprar-ingresso', verificarAutenticacao, async (req, res) => {
    const { caravanaId, quantidade } = req.body;
    const { uid: usuarioId, email: usuarioEmail, name: usuarioNome } = req.user;
    let nomeLocalidade = 'Desconhecida'; let caravanaAposCompra;

    try {
        if (!caravanaId || !quantidade) return res.status(400).json({ error: "Campos obrigatórios." });
        const quantidadeNumerica = parseInt(quantidade, 10);
        if (isNaN(quantidadeNumerica) || quantidadeNumerica <= 0) return res.status(400).json({ error: "Quantidade inválida." });

        const caravanaRef = db.collection('caravanas').doc(caravanaId);

        await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) throw new Error('Caravana não encontrada.');
            const caravana = caravanaDoc.data();

            if (caravana.status === 'cancelada') throw new Error('Caravana cancelada.');
            const hoje = new Date(); const dataViagem = new Date(caravana.data + 'T00:00:00');
            if (dataViagem < hoje.setHours(0,0,0,0)) throw new Error('Caravana já ocorreu.');
            const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59') : null;
            if (dataFechamento && hoje > dataFechamento) throw new Error(`Vendas fechadas em ${formatDate(caravana.dataFechamentoVendas)}.`);

            const participantesQuery = db.collection('participantes').where('caravanaId', '==', caravanaId);
            const participantesSnap = await transaction.get(participantesQuery);
            let vagasOcupadasAtuais = 0;
            participantesSnap.forEach(pDoc => { vagasOcupadasAtuais += parseInt(pDoc.data().quantidade, 10) || 0; });
            if (caravana.administradorUid) vagasOcupadasAtuais += 1;
            const vagasNecessariasFuturas = vagasOcupadasAtuais + quantidadeNumerica;

            let capacidadeMaximaPermitida = 0;

            if (caravana.transporteAlocado) {
                capacidadeMaximaPermitida = caravana.transporteAlocado.assentos || 0;
            } else {
                const transportesQuery = db.collection('transportes').orderBy('assentos', 'desc').limit(1);
                const transportesSnap = await transaction.get(transportesQuery);
                if (transportesSnap.empty) throw new Error("Nenhum tipo de transporte cadastrado.");
                capacidadeMaximaPermitida = transportesSnap.docs[0].data().assentos || 0;
            }

            if (vagasNecessariasFuturas > capacidadeMaximaPermitida) {
                const vagasDisponiveisReais = Math.max(0, capacidadeMaximaPermitida - vagasOcupadasAtuais);
                throw new Error(`Capacidade máxima (${capacidadeMaximaPermitida}) excedida. Vagas restantes: ${vagasDisponiveisReais}.`);
            }

            const participantesRef = db.collection('participantes').doc();
            transaction.set(participantesRef, { caravanaId, email: usuarioEmail, nome: usuarioNome || null, uid: usuarioId, quantidade: quantidadeNumerica, timestamp: admin.firestore.FieldValue.serverTimestamp() });
            const novasVagasDisponiveisDB = (caravana.vagasDisponiveis ?? caravana.vagasTotais ?? 0) - quantidadeNumerica;
            transaction.update(caravanaRef, { vagasDisponiveis: novasVagasDisponiveisDB });
        });

        const caravanaAposCompraDoc = await caravanaRef.get();
        if (!caravanaAposCompraDoc.exists) throw new Error("Erro ao finalizar compra.");
        caravanaAposCompra = caravanaAposCompraDoc.data();
        const locData = await getLocalidadeData(caravanaAposCompra.localidadeId);
        nomeLocalidade = locData.nomeLocalidade || caravanaId;
        res.status(200).json({ message: `${quantidadeNumerica} i. comprado(s)!`, caravanaStatus: caravanaAposCompra.status });
        enviarEmailsPosCompra(usuarioEmail, quantidadeNumerica, caravanaId, caravanaAposCompra, nomeLocalidade);

    } catch (error) { console.error(error); /* ... tratamento de erro ... */ }
});







// Rota para buscar os participantes de uma caravana específica (requer admin ou permissão específica)
app.get('/participantes/:caravanaId', verificarAutenticacao, verificarFuncionarioOuAdmin, async (req, res) => {
    const { caravanaId } = req.params;
    let participantes = [];

    try {
        const caravanaDoc = await db.collection('caravanas').doc(caravanaId).get();
         if (!caravanaDoc.exists) {
             return res.status(404).json({ error: 'Caravana não encontrada.' });
         }

        const participantesSnapshot = await db.collection('participantes')
            .where('caravanaId', '==', caravanaId)
            .orderBy('timestamp', 'desc') 
            .get();

        for (const doc of participantesSnapshot.docs) {
            const participante = doc.data();
            let usuarioData = {};

            if (participante.uid) {
                try {
                    const usuarioDoc = await db.collection('users').doc(participante.uid).get();
                    if (usuarioDoc.exists) {
                        const uData = usuarioDoc.data();
                        usuarioData = {
                            nome: uData.nome || participante.nome,
                            telefone: uData.telefone,
                        };
                    } else {
                         usuarioData = { nome: participante.nome || "Usuário não encontrado", telefone: "N/A" };
                    }
                } catch (userError) {
                    console.error("Erro ao buscar detalhes do usuário:", participante.uid, userError);
                    usuarioData = { nome: participante.nome || "Erro ao buscar usuário", telefone: "N/A" };
                }
            } else {
                usuarioData = { nome: participante.nome || "UID Ausente", telefone: "N/A" };
            }

            participantes.push({
                id: doc.id, 
                uid: participante.uid,
                email: participante.email,
                quantidade: participante.quantidade,
                timestamp: participante.timestamp, 
                ...usuarioData, 
            });
        }

        res.status(200).json(participantes);

    } catch (error) {
        console.error(`Erro ao buscar participantes da caravana ${caravanaId}:`, error);
        res.status(500).json({ error: "Erro interno ao buscar participantes." });
    }
});


// server.js

// --- ROTAS DE TRANSPORTES ---

app.post('/transportes', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        // Removido placa, fornecedor (mantido?), imagemUrl (mantida)
        const { nome, assentos, imagemUrl, fornecedor } = req.body;
        if (!nome || !assentos || !fornecedor) { // Fornecedor mantido como obrigatório? Se não, remova daqui e do erro.
            return res.status(400).json({ error: "Nome, assentos e fornecedor são obrigatórios." });
        }
        const assentosNum = parseInt(assentos, 10);
        if (isNaN(assentosNum) || assentosNum <= 0) return res.status(400).json({ error: "Assentos inválidos." });

        const nomeCheck = await db.collection('transportes').where('nome', '==', nome).limit(1).get();
        if (!nomeCheck.empty) return res.status(400).json({ error: `Tipo '${nome}' já existe.` });

        const novoTransporte = {
            nome, assentos: assentosNum, imagemUrl: imagemUrl || null,
            fornecedor: fornecedor,
            // Removido placa, disponibilidade agora é implícita (tipo sempre existe)
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('transportes').add(novoTransporte);
        res.status(201).json({ id: docRef.id, ...novoTransporte });
    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno.", details: error.message }); }
});

// PUT /transportes/:id - Atualizar TIPO (sem placa)
app.put('/transportes/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Removido placa, disponivel
        const { nome, assentos, imagemUrl, fornecedor } = req.body;
        const transporteRef = db.collection('transportes').doc(id);
        const docSnap = await transporteRef.get();
        if (!docSnap.exists) return res.status(404).json({ error: "Tipo não encontrado." });
        const dadosAtualizados = {}; let hasUpdate = false;
        if (nome !== undefined) { if (!nome) return res.status(400).json({ error: "Nome vazio." }); dadosAtualizados.nome = nome; hasUpdate = true; }
        if (assentos !== undefined) { const n = parseInt(assentos, 10); if (isNaN(n) || n <= 0) return res.status(400).json({ error: "Assentos inválidos." }); dadosAtualizados.assentos = n; hasUpdate = true; }
        if (imagemUrl !== undefined) { dadosAtualizados.imagemUrl = imagemUrl; hasUpdate = true; }
        if (fornecedor !== undefined) { if (!fornecedor) return res.status(400).json({ error: "Fornecedor vazio." }); dadosAtualizados.fornecedor = fornecedor; hasUpdate = true; }
        // <<< REMOVIDO lógica da placa e disponibilidade >>>

        if (!hasUpdate) return res.status(400).json({ error: "Nenhum dado válido." });
        dadosAtualizados.lastUpdate = admin.firestore.FieldValue.serverTimestamp();
        await transporteRef.update(dadosAtualizados);
        const updatedDoc = await transporteRef.get();
        res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno.", details: error.message }); }
});

// DELETE /transportes/:id - Excluir TIPO (mantém verificação de uso)
app.delete('/transportes/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
     try {
         const { id } = req.params;
         const transporteRef = db.collection('transportes').doc(id);
         const docSnap = await transporteRef.get();
         if (!docSnap.exists) return res.status(404).json({ error: "Tipo não encontrado." });
         // Verifica se o TIPO (pelo ID) está em uso
         const caravanasUsandoSnap = await db.collection('caravanas')
             .where('transporteAlocado.id', '==', id) // Busca pelo ID dentro do objeto
             .where('data', '>=', new Date().toISOString().split('T')[0])
             .where('status', '!=', 'cancelada')
             .limit(1).get();
         if (!caravanasUsandoSnap.empty) {
             return res.status(400).json({ error: "Este tipo de transporte está alocado em caravanas futuras." });
         }
         await transporteRef.delete();
         res.status(204).send();
     } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno." }); }
 });


// GET /transportes - Listar TIPOS de transporte
app.get('/transportes', verificarAutenticacao, verificarFuncionarioOuAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('transportes').orderBy('assentos').get(); // Ordena por assentos
        const transportes = [];
        snapshot.forEach(doc => transportes.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(transportes);
    } catch (error) { console.error(error); res.status(500).json({ error: "Erro interno." }); }
});






// --- FIM ROTAS DE TRANSPORTES ---


// CRON JOBS (Tarefas Agendadas)


// Verifica caravanas não confirmadas perto da data limite e as cancela automaticamente
// const verificarCancelamentoAutomatico = async () => {
//     console.log('[CRON] Executando verificação de cancelamento automático...');
//     const hoje = new Date();
//     hoje.setHours(0, 0, 0, 0); 

//     try {
//         const caravanasSnapshot = await db.collection('caravanas')
//             .where('status', '==', 'nao_confirmada')
//             .get();

//         if (caravanasSnapshot.empty) {
//              console.log('[CRON] Nenhuma caravana não confirmada encontrada.');
//              return;
//         }

//         for (const doc of caravanasSnapshot.docs) {
//             const caravana = doc.data();
//             const caravanaId = doc.id;
//             const dataCaravana = new Date(caravana.data); 
//              dataCaravana.setUTCHours(0,0,0,0); 

//             const dataLimite = new Date(dataCaravana);
//             dataLimite.setUTCDate(dataCaravana.getUTCDate() - 14);

//             if (hoje >= dataLimite) {
//                  const vagasOcupadas = caravana.vagasTotais - caravana.vagasDisponiveis;
//                  if (vagasOcupadas < caravana.ocupacaoMinima) {
//                       console.log(`[CRON] Caravana ${caravanaId} (${caravana.nomeLocalidade}) atingiu data limite sem ocupação mínima. Cancelando...`);
//                       try {
//                            await db.collection('caravanas').doc(caravanaId).update({
//                                status: 'cancelada',
//                                motivoCancelamento: 'Cancelada automaticamente: não atingiu o número mínimo de participantes a tempo.',
//                                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
//                            });

//                            const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
//                            if (participantesNotificar.length > 0) {
//                                const localidadeData = await getLocalidadeData(caravana.localidadeId);
//                                const nomeLocalidade = localidadeData.nomeLocalidade || caravana.localidadeId;
//                                const emailSubject = `Caravana para ${nomeLocalidade} Cancelada Automaticamente`;
//                                const emailHtml = `
//                                 <p>Olá!</p>
//                                 <p>Informamos que a caravana para <strong>${nomeLocalidade}</strong> marcada para ${formatDate(caravana.data)} foi cancelada automaticamente por não atingir o número mínimo de participantes até a data limite.</p>
//                                 <p>Por favor, entre em contato conosco para discutir opções de reembolso.</p>
//                                `;
//                                for (const participante of participantesNotificar) {
//                                    await sendEmail(participante.email, emailSubject, emailHtml);
//                                }
//                                console.log(`[CRON] ${participantesNotificar.length} participantes notificados sobre cancelamento automático da caravana ${caravanaId}.`);
//                            }
//                       } catch (cancelError) {
//                            console.error(`[CRON] Erro ao cancelar automaticamente ou notificar para caravana ${caravanaId}:`, cancelError);
//                       }
//                  }
//             }
//         }
//          console.log('[CRON] Verificação de cancelamento automático concluída.');
//     } catch (error) {
//         console.error('[CRON] Erro geral na tarefa de cancelamento automático:', error);
//     }
// };


const confirmarOuCancelarPosVendas = async () => {
    console.log('[CRON] Verificação Pós-Vendas e Alocação Final...');
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const ontemStr = ontem.toISOString().split('T')[0];

    try {
        const caravanasSnap = await db.collection('caravanas')
            .where('dataFechamentoVendas', '==', ontemStr)
            .where('status', '==', 'nao_confirmada')
            .get();

        if (caravanasSnap.empty) { console.log('[CRON] Nenhuma caravana pós-vendas para verificar.'); return; }
        console.log(`[CRON] Verificando ${caravanasSnap.size} caravanas pós-vendas.`);

        const transportesSnap = await db.collection('transportes').orderBy('assentos', 'asc').get(); // Menor primeiro
        const tiposTransporte = [];
        transportesSnap.forEach(doc => tiposTransporte.push({ id: doc.id, ...doc.data() }));

        for (const doc of caravanasSnap.docs) {
            const caravana = doc.data(); const caravanaId = doc.id;
            const caravanaRef = db.collection('caravanas').doc(caravanaId);
            const ocupacaoMinima = caravana.ocupacaoMinima || 0;

            const participantesSnap = await db.collection('participantes').where('caravanaId', '==', caravanaId).get();
            let vagasOcupadas = 0;
            participantesSnap.forEach(pDoc => { vagasOcupadas += parseInt(pDoc.data().quantidade, 10) || 0; });
            let vagasNecessariasFinais = vagasOcupadas + (caravana.administradorUid ? 1 : 0);

            if (vagasOcupadas >= ocupacaoMinima) {
                console.log(`[CRON] ${caravanaId}: Atingiu mínimo (${vagasOcupadas}/${ocupacaoMinima}). Tentando alocar transporte...`);

                // --- ALOCAÇÃO FINAL DO TRANSPORTE ---
                let tipoEscolhido = null;
                for (const tipo of tiposTransporte) {
                    if (tipo.assentos >= vagasNecessariasFinais) {
                        tipoEscolhido = tipo; break; // Pega o menor que cabe
                    }
                }

                if (tipoEscolhido) {
                     console.log(`[CRON] ${caravanaId}: Transporte tipo ${tipoEscolhido.nome} (${tipoEscolhido.assentos}) selecionado.`);
                     const capacidadeFinal = tipoEscolhido.assentos;
                     const vagasDisponiveisFinal = Math.max(0, capacidadeFinal - vagasNecessariasFinais);
                     const precoFinal = caravana.preco > 0 ? caravana.preco : Math.ceil(((caravana.despesas || 0) + (caravana.lucroAbsoluto || 0)) / (capacidadeFinal || 1));

                     const transporteAlocadoObj = {
                         id: tipoEscolhido.id, nome: tipoEscolhido.nome,
                         assentos: capacidadeFinal, placa: null, motoristaUid: null // Placa e motorista definidos manualmente depois
                     };

                     try {
                         await caravanaRef.update({
                             status: 'confirmada', confirmadaEm: admin.firestore.FieldValue.serverTimestamp(),
                             transporteAlocado: transporteAlocadoObj,
                             vagasTotais: capacidadeFinal, vagasDisponiveis: vagasDisponiveisFinal,
                             preco: precoFinal,
                             lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                         });
                          console.log(`[CRON] ${caravanaId}: Confirmada e transporte alocado.`);
                         // Opcional: Email "Sua caravana foi confirmada!"
                     } catch (updateError) { console.error(`[CRON] Erro ao CONFIRMAR/ALOCAR ${caravanaId}:`, updateError); }

                } else {
                     console.warn(`[CRON] ${caravanaId}: ATINGIU MÍNIMO, MAS NENHUM TRANSPORTE COMPORTA ${vagasNecessariasFinais} pessoas! Cancelando.`);
                     // Cancela mesmo tendo atingido o mínimo, pois não há transporte
                     try {
                          await caravanaRef.update({
                             status: 'cancelada', motivoCancelamento: 'Cancelada: não há transporte disponível para a quantidade de participantes.',
                             lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                         });
                          // Enviar email de cancelamento...
                     } catch (cancelError) { console.error(`[CRON] Erro ao cancelar ${caravanaId} por falta de transporte:`, cancelError); }
                }
                // --- FIM ALOCAÇÃO ---

            } else { // Não atingiu o mínimo
                console.log(`[CRON] ${caravanaId}: Não atingiu mínimo (${vagasOcupadas}/${ocupacaoMinima}). Cancelando.`);
                 try {
                     await caravanaRef.update({ status: 'cancelada', motivoCancelamento: 'Cancelada: não atingiu o mínimo pós-vendas.', lastUpdate: admin.firestore.FieldValue.serverTimestamp() });
                     // Enviar email de cancelamento...
                 } catch (updateError) { console.error(`[CRON] Erro ao CANCELAR ${caravanaId}:`, updateError); }
            }
        }
         console.log('[CRON] Verificação pós-vendas concluída.');
    } catch (error) { console.error('[CRON] Erro geral tarefa pós-vendas:', error); }
};


// ATUALIZADO: Enviar Lembretes DIARIAMENTE para Caravanas Confirmadas
const enviarLembretes = async () => {
    console.log('[CRON] Executando envio de lembretes DIÁRIOS...');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    try {
        // Busca TODAS as caravanas confirmadas que AINDA NÃO OCORRERAM
        const caravanasConfirmadasSnap = await db.collection('caravanas')
            .where('status', '==', 'confirmada')
            .where('data', '>=', hoje.toISOString().split('T')[0]) // Compara com data de hoje (ou posterior)
            .get();

        if (caravanasConfirmadasSnap.empty) {
            console.log('[CRON] Nenhuma caravana confirmada futura encontrada para lembrete.');
            return;
        }

        console.log(`[CRON] Enviando lembretes para ${caravanasConfirmadasSnap.size} caravanas confirmadas...`);

        for (const doc of caravanasConfirmadasSnap.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;

            // A verificação de data foi movida para a query, o IF abaixo foi removido:
            // if (hoje.getTime() === dataLembrete.getTime()) { ... }

            try {
                const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
                if (participantesNotificar.length > 0) {
                    const localidadeData = await getLocalidadeData(caravana.localidadeId);
                    const nomeLocalidade = localidadeData.nomeLocalidade || caravana.localidadeId;
                    let infoTransporte = "<p>Detalhes do transporte serão confirmados em breve.</p>";
                    if (caravana.transporteConfirmado && caravana.transportesAlocados?.length > 0) {
                        infoTransporte = "<p>Seu transporte alocado:</p><ul>";
                        caravana.transportesAlocados.forEach(t => { infoTransporte += `<li>${t.nome || 'Veículo'} - Placa: ${t.placa || 'N/A'}</li>`; });
                        infoTransporte += "</ul>";
                    } else if (caravana.transporteConfirmado) { infoTransporte = "<p>Transporte confirmado (sem veículo específico).</p>"; }

                    const emailSubject = `Lembrete: Caravana para ${nomeLocalidade} em ${formatDate(caravana.data)}`;
                    const emailHtml = `
                        <p>Olá!</p>
                        <p>Lembrete diário sobre sua caravana confirmada para <strong>${nomeLocalidade}</strong> no dia ${formatDate(caravana.data)}.</p>
                        ${caravana.horarioSaida ? `<p>Horário previsto de saída: ${caravana.horarioSaida}.</p>` : ''}
                        ${infoTransporte}
                        <p>Estamos ansiosos para viajar com você!</p>
                        <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                    `; // Mensagem adaptada para lembrete diário
                    for (const participante of participantesNotificar) {
                        await sendEmail(participante.email, emailSubject, emailHtml);
                    }
                     console.log(`[CRON] ${participantesNotificar.length} lembretes enviados para ${caravanaId}.`);
                }
            } catch (lembreteError) { console.error(`[CRON] Erro ao enviar lembretes para ${caravanaId}:`, lembreteError); }
        } // Fim do loop for
         console.log('[CRON] Envio de lembretes diários concluído.');
    } catch (error) { console.error('[CRON] Erro geral envio lembretes:', error); }
};








// Agenda as tarefas Cron

cron.schedule('0 0 * * *', enviarLembretes, { scheduled: true, timezone: "America/Sao_Paulo" }); // 8 da manhã
cron.schedule('0 0 * * *', confirmarOuCancelarPosVendas, { scheduled: true, timezone: "America/Sao_Paulo" });

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}`);
});