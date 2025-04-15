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

// Função interna refatorada para buscar caravanas do usuário, com filtro opcional por status
async function getCaravanasUsuarioPorStatus(userId, status = undefined) {
    try {
        const participantesSnapshot = await db.collection('participantes')
            .where('uid', '==', userId)
            .get();

        if (participantesSnapshot.empty) {
            return []; 
        }

        const caravanasInfoUsuario = {};
        participantesSnapshot.forEach(doc => {
            const participante = doc.data();
            const caravanaId = participante.caravanaId;
            const quantidade = parseInt(participante.quantidade, 10) || 0;
            if (!caravanasInfoUsuario[caravanaId]) {
                caravanasInfoUsuario[caravanaId] = { id: caravanaId, quantidadeTotalUsuario: 0 };
            }
            caravanasInfoUsuario[caravanaId].quantidadeTotalUsuario += quantidade;
        });

        const caravanasIds = Object.keys(caravanasInfoUsuario);

        if (caravanasIds.length === 0) return [];

        let caravanasQuery = db.collection('caravanas')
            .where(admin.firestore.FieldPath.documentId(), 'in', caravanasIds);

        if (status && ['confirmada', 'nao_confirmada', 'cancelada'].includes(status)) {
            caravanasQuery = caravanasQuery.where('status', '==', status);
        }

        const caravanasSnapshot = await caravanasQuery.get();
        const caravanas = [];

        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;

            const localidadeData = await getLocalidadeData(caravana.localidadeId);
            const metrics = calculateCaravanaMetrics(caravana); 

            caravanas.push({
                id: caravanaId,
                ...caravana,
                ...localidadeData,
                ...metrics, 
                quantidadeTotalUsuario: caravanasInfoUsuario[caravanaId]?.quantidadeTotalUsuario || 0, 
            });
        }

        caravanas.sort((a, b) => new Date(b.data) - new Date(a.data));

        return caravanas;
    } catch (error) {
        console.error(`Erro em getCaravanasUsuarioPorStatus para userId ${userId}:`, error);
        throw error; 
    }
}



// ROTAS DE FUNCIONÁRIOS (ADMIN/INTERNO) - Necessitarão de revisão de permissões

// Rota para criar um novo funcionário (requer admin)
app.post('/funcionarios', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { nome, email, salario, telefone, senha } = req.body;

        if (!nome || !email || !salario || !telefone || !senha) return res.status(400).json({ error: "Todos os campos são obrigatórios." });
        if (typeof salario !== 'number') return res.status(400).json({ error: "Salário deve ser numérico." });
        if (senha.length < 6) return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Formato de email inválido." });
        const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(telefone)) return res.status(400).json({ error: "Formato de telefone inválido." });

        const userRecord = await admin.auth().createUser({
            email: email,
            password: senha,
            displayName: nome, 
        });

        const novoFuncionario = {
            nome,
            email,
            salario: salario,
            telefone: telefone,
            uid: userRecord.uid, 
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = db.collection('funcionarios').doc(userRecord.uid);
        await docRef.set(novoFuncionario);

        res.status(201).json({ id: userRecord.uid, ...novoFuncionario });

    } catch (error) {
        console.error('Erro ao criar funcionário:', error);
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: 'Este email já está em uso no Firebase Auth.' });
        }
        res.status(500).json({ error: 'Erro interno ao criar funcionário.' });
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

// Rota para atualizar dados de um funcionário (requer admin)
app.put('/funcionarios/:id', verificarAutenticacao, verificarAdmin, async (req, res) => { 
    try {
        const { id } = req.params; // ID é o UID
        const { nome, email, salario, telefone } = req.body;

        const funcionarioRef = db.collection('funcionarios').doc(id);
        const funcDoc = await funcionarioRef.get();

        if (!funcDoc.exists) {
            return res.status(404).json({ error: 'Funcionário não encontrado.' });
        }

        const funcionarioAtualizado = {};
        if (nome !== undefined) funcionarioAtualizado.nome = nome;
        if (email !== undefined) funcionarioAtualizado.email = email; 
        if (salario !== undefined) {
             if (typeof salario !== 'number') return res.status(400).json({ error: "Salário deve ser numérico." });
             funcionarioAtualizado.salario = salario;
        }
        if (telefone !== undefined) {
             const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
             if (!phoneRegex.test(telefone)) return res.status(400).json({ error: "Formato de telefone inválido." });
             funcionarioAtualizado.telefone = telefone;
        }
        funcionarioAtualizado.lastUpdate = admin.firestore.FieldValue.serverTimestamp();

        await funcionarioRef.update(funcionarioAtualizado);

        try {
             const authUpdates = {};
             if (email !== undefined && email !== funcDoc.data().email) authUpdates.email = email; 
             if (nome !== undefined && nome !== funcDoc.data().nome) authUpdates.displayName = nome;
             if (Object.keys(authUpdates).length > 0) {
                 await admin.auth().updateUser(id, authUpdates);
             }
        } catch (authError) {
             console.error("Erro ao atualizar dados no Firebase Auth:", authError);
             return res.status(500).json({ error: 'Erro ao atualizar dados de autenticação do funcionário.', details: authError.message });
        }

        res.status(200).json({ message: 'Funcionário atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar funcionário.' });
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

// Rota para buscar as caravanas associadas a um funcionário (ex: pelo ID do administrador)
app.get('/funcionarios/:uid/caravanas', verificarAutenticacao, async (req, res) => {
    const { uid } = req.params;

    if (req.user.uid !== uid && req.user.email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ error: "Acesso não autorizado." });
    }

    try {
        const caravanasSnapshot = await db.collection('caravanas')
            .where('administradorUid', '==', uid) 
            .get();

        const caravanas = [];
        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
            const localidadeData = await getLocalidadeData(caravana.localidadeId);
            const metrics = calculateCaravanaMetrics(caravana);

            caravanas.push({
                id: doc.id,
                ...caravana,
                ...localidadeData,
                ...metrics
            });
        }
         caravanas.sort((a, b) => new Date(b.data) - new Date(a.data));

        res.status(200).json(caravanas);

    } catch (error) {
        console.error(`Erro ao buscar caravanas do funcionário ${uid}:`, error);
        res.status(500).json({ error: 'Erro interno ao buscar caravanas do funcionário.' });
    }
});



// ROTAS DE CARAVANAS


// Rota para criar uma nova caravana (requer admin)
app.post('/caravanas', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const {
            localidadeId,
            data,
            horarioSaida,
            vagasTotais,
            despesas,
            lucroAbsoluto,
            ocupacaoMinima,
            nomeAdministrador, 
            emailAdministrador,
            telefoneAdministrador
        } = req.body;

        if (!localidadeId || !data || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios para cálculo." });
        }
         if (!nomeAdministrador || !emailAdministrador || !telefoneAdministrador) {
            return res.status(400).json({ error: "Informações do administrador são obrigatórias." });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
             return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD." });
        }

        const vagasTotaisNum = parseInt(vagasTotais, 10);
        const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10);
        const despesasNum = parseFloat(despesas);
        const lucroAbsolutoNum = parseFloat(lucroAbsoluto);
        if (isNaN(vagasTotaisNum) || isNaN(ocupacaoMinimaNum) || isNaN(despesasNum) || isNaN(lucroAbsolutoNum) || vagasTotaisNum <= 0 || ocupacaoMinimaNum <= 0) {
             return res.status(400).json({ error: "Vagas totais, ocupação mínima, despesas e lucro devem ser números positivos." });
        }
        if (ocupacaoMinimaNum > vagasTotaisNum) {
             return res.status(400).json({ error: "Ocupação mínima não pode ser maior que as vagas totais." });
        }

        const precoCalculado = (despesasNum + lucroAbsolutoNum) / ocupacaoMinimaNum;

        const precoFinal = Math.ceil(precoCalculado);



        const novaCaravana = {
            localidadeId,
            data, 
            horarioSaida: horarioSaida || null,
            vagasTotais: vagasTotaisNum,
            vagasDisponiveis: vagasTotaisNum, 
            despesas: despesasNum,
            lucroAbsoluto: lucroAbsolutoNum, 
            ocupacaoMinima: ocupacaoMinimaNum,
            preco: precoFinal,
            status: "nao_confirmada", 
            nomeAdministrador,
            emailAdministrador,
            telefoneAdministrador,
            administradorUid: req.user.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const localidadeRef = db.collection('localidades').doc(localidadeId);
        const localidadeDoc = await localidadeRef.get();
        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade selecionada não encontrada.' });
        }

        const docRef = await db.collection('caravanas').add(novaCaravana);
        res.status(201).json({ id: docRef.id, ...novaCaravana });

    } catch (error) {
        console.error("Erro ao criar caravana:", error);
        res.status(500).json({ error: "Erro interno ao criar caravana.", details: error.message });
    }
});

// Rota para atualizar uma caravana existente (requer admin)
app.put('/caravanas/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        localidadeId, data, horarioSaida, vagasTotais, despesas,
        lucroAbsoluto, ocupacaoMinima, preco, 
        nomeAdministrador, emailAdministrador, telefoneAdministrador
    } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        const caravanaAtual = caravanaDoc.data();

        if (!localidadeId || !data || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD." });
        }
        const vagasTotaisNum = parseInt(vagasTotais, 10);
        const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10);
        const despesasNum = parseFloat(despesas);
        const lucroAbsolutoNum = parseFloat(lucroAbsoluto);
        const precoNum = preco ? parseFloat(preco) : null; 

        if (isNaN(vagasTotaisNum) || isNaN(ocupacaoMinimaNum) || isNaN(despesasNum) || isNaN(lucroAbsolutoNum) || (precoNum !== null && isNaN(precoNum)) || vagasTotaisNum <= 0 || ocupacaoMinimaNum <= 0) {
             return res.status(400).json({ error: "Valores numéricos inválidos ou não positivos." });
        }
        if (ocupacaoMinimaNum > vagasTotaisNum) {
             return res.status(400).json({ error: "Ocupação mínima não pode ser maior que as vagas totais." });
        }
        let novasVagasDisponiveis = caravanaAtual.vagasDisponiveis;
        const vagasOcupadas = caravanaAtual.vagasTotais - caravanaAtual.vagasDisponiveis;
        if (vagasTotaisNum < caravanaAtual.vagasTotais) {
             if (vagasTotaisNum < vagasOcupadas) {
                  return res.status(400).json({ error: `Não é possível diminuir as vagas totais para ${vagasTotaisNum}, pois já existem ${vagasOcupadas} vagas ocupadas.` });
             }
             novasVagasDisponiveis = vagasTotaisNum - vagasOcupadas;
        } else if (vagasTotaisNum > caravanaAtual.vagasTotais) {
             novasVagasDisponiveis += (vagasTotaisNum - caravanaAtual.vagasTotais); 
        }

        let precoFinal;
        if (precoNum !== null && precoNum >= 0) {
            precoFinal = precoNum;
        } else {
             const precoCalculado = (despesasNum + lucroAbsolutoNum) / ocupacaoMinimaNum;
             precoFinal = Math.ceil(precoCalculado);
        }

        if (localidadeId !== caravanaAtual.localidadeId) {
            const localidadeRef = db.collection('localidades').doc(localidadeId);
            const localidadeDoc = await localidadeRef.get();
            if (!localidadeDoc.exists) {
                return res.status(404).json({ error: 'Nova localidade selecionada não encontrada.' });
            }
        }

        const dadosAtualizados = {
            localidadeId,
            data,
            horarioSaida: horarioSaida || null,
            vagasTotais: vagasTotaisNum,
            vagasDisponiveis: novasVagasDisponiveis,
            despesas: despesasNum,
            lucroAbsoluto: lucroAbsolutoNum,
            ocupacaoMinima: ocupacaoMinimaNum,
            preco: precoFinal,
            nomeAdministrador: nomeAdministrador || caravanaAtual.nomeAdministrador,
            emailAdministrador: emailAdministrador || caravanaAtual.emailAdministrador,
            telefoneAdministrador: telefoneAdministrador || caravanaAtual.telefoneAdministrador,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        };

        await caravanaRef.update(dadosAtualizados);

        const caravanaAtualizadaDoc = await caravanaRef.get(); 
        res.status(200).json({ id: caravanaAtualizadaDoc.id, ...caravanaAtualizadaDoc.data() });

    } catch (error) {
        console.error(`Erro ao atualizar caravana ${id}:`, error);
        res.status(500).json({ error: "Erro interno ao atualizar caravana.", details: error.message });
    }
});

// Rota para buscar detalhes de uma caravana específica pelo ID
app.get("/caravanas/:id", async (req, res) => { 
    const { id } = req.params;
    try {
        const caravanaDoc = await db.collection("caravanas").doc(id).get();
        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: "Caravana não encontrada." });
        }
        const caravana = caravanaDoc.data();
        const localidadeData = await getLocalidadeData(caravana.localidadeId);
        const metrics = calculateCaravanaMetrics(caravana);

        res.status(200).json({
            id: caravanaDoc.id,
            ...caravana,
            ...localidadeData,
            ...metrics,
        });
    } catch (error) {
        console.error(`Erro ao buscar caravana ${id}:`, error);
        res.status(500).json({ error: "Erro interno ao buscar caravana." });
    }
});

// Rota para buscar todas as caravanas com filtros e ordenação opcionais
app.get("/caravanas", async (req, res) => { 
    try {
        let caravanasQuery = db.collection("caravanas");
        const { sortBy, status } = req.query;

        if (status) {
            const validStatuses = ['confirmada', 'nao_confirmada', 'cancelada']; 
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: "Status inválido." });
            }
            caravanasQuery = caravanasQuery.where("status", "==", status);
        } else {
        }

        if (sortBy === 'data_asc') {
            caravanasQuery = caravanasQuery.orderBy('data', 'asc');
        } else if (sortBy === 'data_desc') {
            caravanasQuery = caravanasQuery.orderBy('data', 'desc');
        } else if (sortBy === 'preco_asc') {
             caravanasQuery = caravanasQuery.orderBy('preco', 'asc');
        } else if (sortBy === 'preco_desc') {
             caravanasQuery = caravanasQuery.orderBy('preco', 'desc');
        } else {
             caravanasQuery = caravanasQuery.orderBy('status', 'asc').orderBy('data', 'asc');
        }

        const caravanasSnapshot = await caravanasQuery.get();
        const caravanas = [];

        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
            const localidadeData = await getLocalidadeData(caravana.localidadeId);
            const metrics = calculateCaravanaMetrics(caravana); 

            caravanas.push({
                id: doc.id,
                ...caravana,
                ...localidadeData,
                ...metrics,
            });
        }

        if (sortBy === 'roi_desc') {
            caravanas.sort((a, b) => (b.roi || 0) - (a.roi || 0)); 
        } else if (sortBy === 'lucro_max_desc') {
            caravanas.sort((a, b) => (b.lucroMaximo || 0) - (a.lucroMaximo || 0));
        } else if (sortBy === 'ocupacao_desc') {
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
    } catch (error) {
        console.error("Erro ao buscar caravanas:", error);
        res.status(500).json({ error: "Erro interno ao buscar caravanas." });
    }
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


// Rota para um usuário comprar ingresso(s) para uma caravana
app.post('/comprar-ingresso', verificarAutenticacao, async (req, res) => {
    const { caravanaId, quantidade } = req.body;
    const { uid: usuarioId, email: usuarioEmail, name: usuarioNome } = req.user; 

    let nomeLocalidade = 'Desconhecida';
    let caravanaAposCompra;

    try {
        if (!caravanaId || !quantidade) {
            return res.status(400).json({ error: "Campos caravanaId e quantidade são obrigatórios." });
        }
        const quantidadeNumerica = parseInt(quantidade, 10);
        if (isNaN(quantidadeNumerica) || quantidadeNumerica <= 0) {
            return res.status(400).json({ error: "A quantidade deve ser um número inteiro positivo." });
        }

        const caravanaRef = db.collection('caravanas').doc(caravanaId);

        const caravanaDocInicial = await caravanaRef.get();
        if (!caravanaDocInicial.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        const caravanaInicial = caravanaDocInicial.data();

        if (caravanaInicial.status === 'cancelada') {
            return res.status(400).json({ error: 'Esta caravana foi cancelada.' });
        }
         if (new Date(caravanaInicial.data) < new Date().setHours(0,0,0,0)) { 
            return res.status(400).json({ error: 'Não é possível comprar ingresso para uma caravana que já ocorreu.' });
         }
        if (caravanaInicial.vagasDisponiveis < quantidadeNumerica) {
            return res.status(400).json({ error: `Não há vagas suficientes. Disponíveis: ${caravanaInicial.vagasDisponiveis}.` });
        }

        const localidadeData = await getLocalidadeData(caravanaInicial.localidadeId);
        if (!localidadeData.nomeLocalidade) {
            console.error(`Localidade ${caravanaInicial.localidadeId} não encontrada para caravana ${caravanaId}.`);

            nomeLocalidade = caravanaInicial.localidadeId; 
        } else {
             nomeLocalidade = localidadeData.nomeLocalidade;
        }


        await db.runTransaction(async (transaction) => {
            const caravanaDocTransacao = await transaction.get(caravanaRef);
            if (!caravanaDocTransacao.exists) { throw new Error('Caravana não encontrada durante a transação.'); }
            const caravanaTransacao = caravanaDocTransacao.data();

            if (caravanaTransacao.vagasDisponiveis < quantidadeNumerica) {
                throw new Error('Não há vagas suficientes.');
            }

             if (caravanaTransacao.status === 'cancelada') {
                throw new Error('A caravana foi cancelada durante a compra.');
            }

            const participantesRef = db.collection('participantes');
            const novoParticipanteRef = participantesRef.doc();
            transaction.set(novoParticipanteRef, {
                caravanaId,
                email: usuarioEmail,
                nome: usuarioNome || null,
                uid: usuarioId,
                quantidade: quantidadeNumerica,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const novasVagasDisponiveis = caravanaTransacao.vagasDisponiveis - quantidadeNumerica;
            const updates = { vagasDisponiveis: novasVagasDisponiveis };
            const vagasOcupadasApos = caravanaTransacao.vagasTotais - novasVagasDisponiveis;

            if (vagasOcupadasApos >= caravanaTransacao.ocupacaoMinima && caravanaTransacao.status !== 'confirmada') {
                updates.status = 'confirmada'; 
                updates.confirmadaEm = admin.firestore.FieldValue.serverTimestamp(); 
            }
            transaction.update(caravanaRef, updates);
        });

        const caravanaAposCompraDoc = await caravanaRef.get();
        if (!caravanaAposCompraDoc.exists) {
            console.error(`Caravana ${caravanaId} não encontrada APÓS compra bem-sucedida.`);
             res.status(200).json({ message: `${quantidadeNumerica} ingresso(s) comprado(s) com sucesso! (Erro ao buscar dados atualizados)` });
             return;
        }
        caravanaAposCompra = caravanaAposCompraDoc.data();

        res.status(200).json({
            message: `${quantidadeNumerica} ingresso(s) comprado(s) com sucesso!`,
            caravanaStatus: caravanaAposCompra.status 
        });

        enviarEmailsPosCompra(usuarioEmail, quantidadeNumerica, caravanaId, caravanaAposCompra, nomeLocalidade);

    } catch (error) {
        console.error(`Erro ao comprar ingresso para caravana ${caravanaId} por usuário ${usuarioId}:`, error);

        if (error.message.includes('Não há vagas suficientes') || error.message.includes('cancelada durante a compra')) {
            res.status(400).json({ error: error.message });
        } else if (error.message.includes('Caravana não encontrada')) {
             res.status(404).json({ error: error.message });
        } else {
             res.status(500).json({ error: `Erro interno ao processar a compra.` });
        }
    }
});



// Rota para buscar os participantes de uma caravana específica (requer admin ou permissão específica)
app.get('/participantes/:caravanaId', verificarAutenticacao, verificarAdmin, async (req, res) => {
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





// CRON JOBS (Tarefas Agendadas)


// Verifica caravanas não confirmadas perto da data limite e as cancela automaticamente
const verificarCancelamentoAutomatico = async () => {
    console.log('[CRON] Executando verificação de cancelamento automático...');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); 

    try {
        const caravanasSnapshot = await db.collection('caravanas')
            .where('status', '==', 'nao_confirmada')
            .get();

        if (caravanasSnapshot.empty) {
             console.log('[CRON] Nenhuma caravana não confirmada encontrada.');
             return;
        }

        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;
            const dataCaravana = new Date(caravana.data); 
             dataCaravana.setUTCHours(0,0,0,0); 

            const dataLimite = new Date(dataCaravana);
            dataLimite.setUTCDate(dataCaravana.getUTCDate() - 14);

            if (hoje >= dataLimite) {
                 const vagasOcupadas = caravana.vagasTotais - caravana.vagasDisponiveis;
                 if (vagasOcupadas < caravana.ocupacaoMinima) {
                      console.log(`[CRON] Caravana ${caravanaId} (${caravana.nomeLocalidade}) atingiu data limite sem ocupação mínima. Cancelando...`);
                      try {
                           await db.collection('caravanas').doc(caravanaId).update({
                               status: 'cancelada',
                               motivoCancelamento: 'Cancelada automaticamente: não atingiu o número mínimo de participantes a tempo.',
                               lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                           });

                           const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
                           if (participantesNotificar.length > 0) {
                               const localidadeData = await getLocalidadeData(caravana.localidadeId);
                               const nomeLocalidade = localidadeData.nomeLocalidade || caravana.localidadeId;
                               const emailSubject = `Caravana para ${nomeLocalidade} Cancelada Automaticamente`;
                               const emailHtml = `
                                <p>Olá!</p>
                                <p>Informamos que a caravana para <strong>${nomeLocalidade}</strong> marcada para ${formatDate(caravana.data)} foi cancelada automaticamente por não atingir o número mínimo de participantes até a data limite.</p>
                                <p>Por favor, entre em contato conosco para discutir opções de reembolso.</p>
                               `;
                               for (const participante of participantesNotificar) {
                                   await sendEmail(participante.email, emailSubject, emailHtml);
                               }
                               console.log(`[CRON] ${participantesNotificar.length} participantes notificados sobre cancelamento automático da caravana ${caravanaId}.`);
                           }
                      } catch (cancelError) {
                           console.error(`[CRON] Erro ao cancelar automaticamente ou notificar para caravana ${caravanaId}:`, cancelError);
                      }
                 }
            }
        }
         console.log('[CRON] Verificação de cancelamento automático concluída.');
    } catch (error) {
        console.error('[CRON] Erro geral na tarefa de cancelamento automático:', error);
    }
};


// Envia lembretes para caravanas confirmadas que ocorrerão em breve
const enviarLembretes = async () => {
    console.log('[CRON] Executando envio de lembretes...');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    try {
        const caravanasSnapshot = await db.collection('caravanas')
            .where('status', '==', 'confirmada')
            .get();

        if (caravanasSnapshot.empty) {
             console.log('[CRON] Nenhuma caravana confirmada encontrada para lembrete.');
             return;
        }

        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;
            const dataCaravana = new Date(caravana.data);
            dataCaravana.setUTCHours(0,0,0,0);

            const dataLembrete = new Date(dataCaravana);
            dataLembrete.setUTCDate(dataCaravana.getUTCDate() - 7);

            if (hoje.getTime() === dataLembrete.getTime()) { 
                 console.log(`[CRON] Enviando lembretes para caravana ${caravanaId} (${caravana.nomeLocalidade})`);
                 try {
                      const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
                      if (participantesNotificar.length > 0) {
                           const localidadeData = await getLocalidadeData(caravana.localidadeId);
                           const nomeLocalidade = localidadeData.nomeLocalidade || caravana.localidadeId;
                           const emailSubject = `Lembrete: Sua Caravana para ${nomeLocalidade} está chegando!`;
                           const emailHtml = `
                            <p>Olá!</p>
                            <p>Falta apenas uma semana para a sua caravana com destino a <strong>${nomeLocalidade}</strong> no dia ${formatDate(caravana.data)}!</p>
                            ${caravana.horarioSaida ? `<p>Lembre-se que o horário previsto de saída é às ${caravana.horarioSaida}.</p>` : ''}
                            <p>Prepare suas malas e confira os últimos detalhes. Estamos ansiosos para viajar com você!</p>
                            <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                           `;
                           for (const participante of participantesNotificar) {
                               await sendEmail(participante.email, emailSubject, emailHtml);
                           }
                           console.log(`[CRON] ${participantesNotificar.length} lembretes enviados para caravana ${caravanaId}.`);
                      }
                 } catch (lembreteError) {
                      console.error(`[CRON] Erro ao enviar lembretes para caravana ${caravanaId}:`, lembreteError);
                 }
            }
        }
         console.log('[CRON] Envio de lembretes concluído.');
    } catch (error) {
         console.error('[CRON] Erro geral na tarefa de envio de lembretes:', error);
    }
};



// Agenda as tarefas Cron
// Roda a verificação de cancelamento uma vez por dia à 1h da manhã (ajuste o horário)
cron.schedule('0 0 * * *', verificarCancelamentoAutomatico, {
     scheduled: true,
     timezone: "America/Sao_Paulo" 
});

// Roda o envio de lembretes uma vez por dia às 8h da manhã (ajuste o horário)
cron.schedule('0 0 * * *', enviarLembretes, {
     scheduled: true,
     timezone: "America/Sao_Paulo" 
});


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}`);
});