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


async function formatDate(dateString) {
    if (!dateString) return '';
    let date;
    if (dateString && typeof dateString.toDate === 'function') {
         date = dateString.toDate();
    } else if (typeof dateString === 'string' && dateString.includes('T')) {
         // Tenta tratar como ISO String completa primeiro
         date = new Date(dateString);
    }
     else {
        // Assume formato YYYY-MM-DD e trata como UTC para evitar problemas de timezone
        date = new Date(dateString + 'T00:00:00Z');
    }

    if (isNaN(date.getTime())) {
        console.warn(`Formato de data inválido recebido: ${dateString}`);
        return typeof dateString === 'string' ? dateString : 'Data inválida';
    }
    // Formata para DD/MM/YYYY (padrão brasileiro)
    const day = String(date.getUTCDate()).padStart(2, '0'); // Usa getUTCDate
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Usa getUTCMonth
    const year = date.getUTCFullYear(); // Usa getUTCFullYear
    return `${day}/${month}/${year}`;
}


// Busca dados essenciais de uma localidade pelo ID (Exemplo)
async function getLocalidadeData(localidadeId) {
    if (!localidadeId) return {};
    try {
        const doc = await db.collection('localidades').doc(localidadeId).get();
        if (doc.exists) {
            const data = doc.data();
            return { nomeLocalidade: data.nome, imagensLocalidade: data.imagens || [], descricaoLocalidade: data.descricao };
        }
        return {};
    } catch (error) {
        console.error(`Erro ao buscar localidade ${localidadeId}:`, error);
        return {};
    }
}

// Busca funcionário pelo UID (Exemplo)
async function getFuncionarioData(uid) {
     if (!uid) return null;
     try {
         const doc = await db.collection('funcionarios').doc(uid).get(); // Busca pelo ID do documento se for o UID
         if (doc.exists) return { id: doc.id, ...doc.data() };

         // Fallback: tenta buscar pelo campo 'uid' se o ID do doc não for o UID
         const snapshot = await db.collection('funcionarios').where('uid', '==', uid).limit(1).get();
          if (!snapshot.empty) {
               const docByField = snapshot.docs[0];
               return { id: docByField.id, ...docByField.data() };
          }
         return null;
     } catch (error) {
         console.error(`Erro ao buscar funcionário UID ${uid}:`, error);
         return null;
     }
}

// Função para buscar a capacidade do maior tipo de transporte
async function getMaxAssentosTransporte() {
    try {
        const transportesSnap = await db.collection('transportes')
                                        .orderBy('assentos', 'desc')
                                        .limit(1)
                                        .get();
        if (!transportesSnap.empty && transportesSnap.docs[0].data().assentos > 0) {
            return transportesSnap.docs[0].data().assentos;
        }
        return 0; // Retorna 0 se não houver transportes ou o maior tiver 0 assentos
    } catch (error) {
        console.error("Erro ao buscar capacidade máxima de transporte:", error);
        // Em produção, talvez logar o erro mas retornar 0 para não quebrar a criação? Ou relançar.
        // throw new Error("Erro ao buscar capacidade máxima de transporte.");
        return 0;
    }
}


// Função de Alocação Otimizada (recursiva com memoização)
async function alocarTransporteOtimizado(pessoasParaAlocar, maxVeiculosPermitido, tiposTransporteDisponiveis) {
    if (pessoasParaAlocar <= 0) return { sucesso: true, combinacao: [], capacidadeTotal: 0, veiculosUsados: 0 };
    if (!tiposTransporteDisponiveis || tiposTransporteDisponiveis.length === 0) return { sucesso: false, erro: "Nenhum tipo de transporte cadastrado." };
    if (maxVeiculosPermitido <= 0) return { sucesso: false, erro: "Número máximo de veículos inválido." };

    const tiposValidos = tiposTransporteDisponiveis.filter(t => t.assentos > 0);
    if (tiposValidos.length === 0) return { sucesso: false, erro: "Nenhum tipo de transporte com assentos válidos."};

    const tiposOrdenados = [...tiposValidos].sort((a, b) => b.assentos - a.assentos);
    const cache = new Map();

    function resolver(pessoasRestantes, veiculosRestantes, indiceTipoAtual = 0) {
        pessoasRestantes = Math.max(0, pessoasRestantes); // Garante não negativo

        if (pessoasRestantes === 0) return { capacidade: 0, veiculos: 0, combinacao: [] }; // Sucesso
        if (veiculosRestantes <= 0 || indiceTipoAtual >= tiposOrdenados.length) {
            return { capacidade: Infinity, veiculos: 0, combinacao: null }; // Impossível
        }

        const cacheKey = `${pessoasRestantes}_${veiculosRestantes}_${indiceTipoAtual}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        const tipoAtual = tiposOrdenados[indiceTipoAtual];

        // Opção 1: Não usar o tipo de transporte atual
        const resSemTipoAtual = resolver(pessoasRestantes, veiculosRestantes, indiceTipoAtual + 1);

        // Opção 2: Usar o tipo de transporte atual (se possível)
        let resComTipoAtual = { capacidade: Infinity, veiculos: 0, combinacao: null }; // Default para impossível
        const resultadoRecursivo = resolver(pessoasRestantes - tipoAtual.assentos, veiculosRestantes - 1, indiceTipoAtual); // Pode usar mais do mesmo tipo

        if (resultadoRecursivo.combinacao !== null) {
             resComTipoAtual = {
                 capacidade: tipoAtual.assentos + resultadoRecursivo.capacidade,
                 veiculos: 1 + resultadoRecursivo.veiculos,
                 combinacao: [{ tipoId: tipoAtual.id, nomeTipo: tipoAtual.nome, assentos: tipoAtual.assentos }, ...resultadoRecursivo.combinacao]
            };
        }

        // Escolhe o melhor resultado (menor capacidade que atende)
        let melhorResultado;
        if (resComTipoAtual.capacidade < resSemTipoAtual.capacidade) {
            melhorResultado = resComTipoAtual;
        } else {
            // Critério de desempate (opcional): menos veículos se capacidade igual
             if (resComTipoAtual.capacidade === resSemTipoAtual.capacidade && resComTipoAtual.veiculos < resSemTipoAtual.veiculos) {
                 melhorResultado = resComTipoAtual;
             } else {
                 melhorResultado = resSemTipoAtual;
             }
        }

        cache.set(cacheKey, melhorResultado);
        return melhorResultado;
    }

    const resultadoFinal = resolver(pessoasParaAlocar, maxVeiculosPermitido);

    if (resultadoFinal.combinacao === null || resultadoFinal.capacidade === Infinity) {
        console.error(`Não foi possível alocar ${pessoasParaAlocar} pessoas com ${maxVeiculosPermitido} veículos.`);
        return { sucesso: false, erro: `Não foi possível encontrar combinação para ${pessoasParaAlocar} pessoas com ${maxVeiculosPermitido} veículos.` };
    }

    const combinacaoAgrupada = resultadoFinal.combinacao.reduce((acc, item) => {
        const existente = acc.find(i => i.tipoId === item.tipoId);
        if (existente) existente.quantidade += 1;
        else acc.push({ tipoId: item.tipoId, nomeTipo: item.nomeTipo, assentos: item.assentos, quantidade: 1 });
        return acc;
    }, []);

    return {
        sucesso: true,
        combinacao: combinacaoAgrupada,
        capacidadeTotal: resultadoFinal.capacidade,
        veiculosUsados: resultadoFinal.veiculos
    };
}

async function distribuirParticipantes(caravanaId, transportesDefinidos) {
    if (!transportesDefinidos || transportesDefinidos.length === 0) {
        return []; // Retorna a lista vazia se não há veículos
    }

    const participantesSnapshot = await db.collection("participantes")
                                          .where("caravanaId", "==", caravanaId)
                                          .orderBy("timestamp", "asc") // Ordena para distribuição consistente
                                          .get();

    // Cria uma lista "plana" de cada ingresso individual
    const ingressosIndividuais = [];
    participantesSnapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        const qtd = data.quantidade || 1;
        for (let i = 0; i < qtd; i++) {
            // Guarda info mínima necessária para atribuição e depois busca detalhes
            ingressosIndividuais.push({ participanteDocId: id, indiceIngresso: i + 1 });
        }
    });

    // Inicializa a estrutura de retorno com contadores
    const veiculosComContagem = transportesDefinidos.map(v => ({
        ...v,
        participantesAtribuidos: [], // Array para IDs de documentos de participantes
        vagasOcupadasClientes: 0 // Contador de clientes neste veículo
    }));

    let ingressoAtualIndex = 0;
    // Distribui os ingressos
    for (const veiculo of veiculosComContagem) {
        const assentosDisponiveisVeiculo = veiculo.assentos || 0;
        while (veiculo.vagasOcupadasClientes < assentosDisponiveisVeiculo && ingressoAtualIndex < ingressosIndividuais.length) {
            // Atribui o ID do documento do participante ao veículo
            veiculo.participantesAtribuidos.push(ingressosIndividuais[ingressoAtualIndex].participanteDocId);
            veiculo.vagasOcupadasClientes++;
            ingressoAtualIndex++;
        }
        // Remove o contador temporário antes de retornar
        // delete veiculo.vagasOcupadasClientes;
    }

    if (ingressoAtualIndex < ingressosIndividuais.length) {
        // Isso não deveria acontecer se a capacidade foi validada corretamente antes
        console.error(`[Distr] Sobraram ${ingressosIndividuais.length - ingressoAtualIndex} ingressos não atribuídos para caravana ${caravanaId}!`);
        // Poderia lançar um erro ou retornar uma flag de erro
    }

    // Retorna a lista de veículos com os IDs dos participantes atribuídos
    // Remove o contador temporário
    return veiculosComContagem.map(({ vagasOcupadasClientes, ...resto }) => resto);
}

function alocacoesDiferentes(alocacaoA, alocacaoB) {
    const a = alocacaoA || [];
    const b = alocacaoB || [];
    if (a.length !== b.length) return true;
    const mapA = new Map();
    a.forEach(item => mapA.set(item.tipoId, item.quantidade));
    for (const itemB of b) {
        if (!mapA.has(itemB.tipoId) || mapA.get(itemB.tipoId) !== itemB.quantidade) {
            return true;
        }
        mapA.delete(itemB.tipoId);
    }
    return mapA.size !== 0;
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
            maximoTransportes, guiaUid,
            dataConfirmacaoTransporte, dataFechamentoVendas
        } = req.body;

        if (!localidadeId || !data || !despesas || !lucroAbsoluto || !ocupacaoMinima || preco === undefined || preco === null || preco === '' || !maximoTransportes || !dataConfirmacaoTransporte) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }

        const precoNum = parseFloat(preco);
        const maxTranspNum = parseInt(maximoTransportes, 10);
        const ocupacaoMinNum = parseInt(ocupacaoMinima, 10);
        const despesasNum = parseFloat(despesas) || 0;
        const lucroNum = parseFloat(lucroAbsoluto) || 0;

        if (isNaN(precoNum) || precoNum < 0) return res.status(400).json({ error: "Preço inválido." });
        if (isNaN(maxTranspNum) || maxTranspNum <= 0) return res.status(400).json({ error: "Número Máximo de Transportes inválido." });
        if (isNaN(ocupacaoMinNum) || ocupacaoMinNum <= 0) return res.status(400).json({ error: "Ocupação Mínima inválida." });

        const maxAssentosPorVeiculo = await getMaxAssentosTransporte();
        if (maxAssentosPorVeiculo <= 0) {
             return res.status(400).json({ error: "Nenhum tipo de transporte com assentos válidos encontrado para calcular capacidade." });
        }
        const capacidadeMaximaTeorica = maxAssentosPorVeiculo * maxTranspNum;
        const adminsTeoricos = maxTranspNum; // 1 admin por transporte potencial

        if (capacidadeMaximaTeorica < (ocupacaoMinNum + adminsTeoricos)) {
            return res.status(400).json({ error: `Capacidade Máxima Teórica (${capacidadeMaximaTeorica}) insuficiente para Ocupação Mínima (${ocupacaoMinNum}) + ${adminsTeoricos} admin(s).` });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: "Formato Data Viagem inválido (YYYY-MM-DD)." });
        if (dataConfirmacaoTransporte && !/^\d{4}-\d{2}-\d{2}$/.test(dataConfirmacaoTransporte)) return res.status(400).json({ error: "Formato Data Conf. Transporte inválido (YYYY-MM-DD)." });
        if (dataFechamentoVendas && !/^\d{4}-\d{2}-\d{2}$/.test(dataFechamentoVendas)) return res.status(400).json({ error: "Formato Data Fech. Vendas inválido (YYYY-MM-DD)." });

        const dtViagem = new Date(data + 'T00:00:00Z');
        const dtConfTransp = dataConfirmacaoTransporte ? new Date(dataConfirmacaoTransporte + 'T00:00:00Z') : null;
        const dtFechVendas = dataFechamentoVendas ? new Date(dataFechamentoVendas + 'T00:00:00Z') : null;

        if (dtConfTransp && dtFechVendas && dtConfTransp > dtFechVendas) return res.status(400).json({ error: "Data Conf. Transporte não pode ser posterior à Data de Fechamento." });
        if (dtFechVendas && dtViagem && dtFechVendas > dtViagem) return res.status(400).json({ error: "Data Fechamento não pode ser posterior à Data da Viagem." });
        if (dtConfTransp && dtViagem && dtConfTransp > dtViagem) return res.status(400).json({ error: "Data Conf. Transporte não pode ser posterior à Data da Viagem." });

        const localidadeRef = db.collection('localidades').doc(localidadeId);
        const localidadeDoc = await localidadeRef.get();
        if (!localidadeDoc.exists) return res.status(404).json({ error: 'Localidade não encontrada.' });

        const tiposSnapshot = await db.collection('transportes').get();
        const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const alocacaoInicial = await alocarTransporteOtimizado(ocupacaoMinNum + adminsTeoricos, maxTranspNum, tiposDisponiveis);

        const novaCaravana = {
            localidadeId, data, horarioSaida: horarioSaida || null,
            despesas: despesasNum, lucroAbsoluto: lucroNum,
            ocupacaoMinima: ocupacaoMinNum, preco: precoNum,
            maximoTransportes: maxTranspNum,
            capacidadeMaximaTeorica: capacidadeMaximaTeorica,
            capacidadeCalculada: alocacaoInicial.sucesso ? alocacaoInicial.capacidadeTotal : 0,
            alocacaoIdealAtual: alocacaoInicial.sucesso ? alocacaoInicial.combinacao : [],
            vagasOcupadas: 0,
            status: "nao_confirmada",
            guiaUid: (guiaUid === "nao_confirmado" || guiaUid === "") ? null : guiaUid,
            administradorUid: null, motoristaUid: null,
            dataConfirmacaoTransporte: dataConfirmacaoTransporte,
            dataFechamentoVendas: dataFechamentoVendas || null,
            transporteDefinidoManualmente: false,
            transporteAutoDefinido: false,
            capacidadeFinalizada: null,
            transportesFinalizados: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('caravanas').add(novaCaravana);
        res.status(201).json({ id: docRef.id, ...novaCaravana });
    } catch (error) {
        console.error("Erro ao criar caravana:", error);
        res.status(500).json({ error: "Erro interno ao criar caravana.", details: error.message });
    }
});

// --- Rota PUT /caravanas/:id ---
app.put('/caravanas/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        localidadeId, data, horarioSaida, despesas, lucroAbsoluto, ocupacaoMinima, preco,
        maximoTransportes, guiaUid,
        dataConfirmacaoTransporte, dataFechamentoVendas
    } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();
        if (!caravanaDoc.exists) return res.status(404).json({ error: 'Caravana não encontrada.' });
        const caravanaAtual = caravanaDoc.data();

        // Validações
        if (!localidadeId || !data || !despesas || !lucroAbsoluto || !ocupacaoMinima || preco === undefined || preco === null || preco === '' || !maximoTransportes || !dataConfirmacaoTransporte) {
             return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }
        const precoNum = parseFloat(preco);
        const maxTranspNum = parseInt(maximoTransportes, 10);
        const ocupacaoMinNum = parseInt(ocupacaoMinima, 10);
        const despesasNum = parseFloat(despesas) || 0;
        const lucroNum = parseFloat(lucroAbsoluto) || 0;

        if (isNaN(precoNum) || precoNum < 0) return res.status(400).json({ error: "Preço inválido." });
        if (isNaN(maxTranspNum) || maxTranspNum <= 0) return res.status(400).json({ error: "Número Máximo de Transportes inválido." });
        if (isNaN(ocupacaoMinNum) || ocupacaoMinNum <= 0) return res.status(400).json({ error: "Ocupação Mínima inválida." });

        const maxAssentosPorVeiculo = await getMaxAssentosTransporte();
        if (maxAssentosPorVeiculo <= 0) return res.status(400).json({ error: "Nenhum tipo de transporte com assentos válidos." });
        const novaCapacidadeMaximaTeorica = maxAssentosPorVeiculo * maxTranspNum;
        const novosAdminsTeoricos = maxTranspNum;

        const vagasOcupadasAtuais = caravanaAtual.vagasOcupadas || 0;

        if (novaCapacidadeMaximaTeorica < (ocupacaoMinNum + novosAdminsTeoricos)) {
            return res.status(400).json({ error: `Nova Capacidade Máxima Teórica (${novaCapacidadeMaximaTeorica}) insuficiente para Ocupação Mínima (${ocupacaoMinNum}) + ${novosAdminsTeoricos} admin(s).` });
        }

        const capacidadeAtualParaVenda = caravanaAtual.transporteDefinidoManualmente
                                      ? (caravanaAtual.capacidadeFinalizada || 0)
                                      : (caravanaAtual.transporteAutoDefinido
                                          ? (caravanaAtual.capacidadeFinalizada || 0)
                                          : (caravanaAtual.capacidadeMaximaTeorica || 0));

        let numAdminsAtuais = 0;
         if ((caravanaAtual.transporteDefinidoManualmente || caravanaAtual.transporteAutoDefinido) && Array.isArray(caravanaAtual.transportesFinalizados)) {
             numAdminsAtuais = Math.min(capacidadeAtualParaVenda, caravanaAtual.transportesFinalizados.length);
         } else if(capacidadeAtualParaVenda > 0) {
             numAdminsAtuais = Math.min(capacidadeAtualParaVenda, caravanaAtual.maximoTransportes || 0);
         }


        if (novaCapacidadeMaximaTeorica < (vagasOcupadasAtuais + numAdminsAtuais)) {
             return res.status(400).json({ error: `Não é possível definir Nº Máx. Transportes para ${maxTranspNum} (Capacidade Teórica ${novaCapacidadeMaximaTeorica}), pois já existem ${vagasOcupadasAtuais} clientes + ${numAdminsAtuais} admin(s) ocupando vagas (baseado na capacidade atual de venda).` });
        }

        // ... (validações de data e localidade - omitido) ...

        const tiposSnapshot = await db.collection('transportes').get();
        const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const novaAlocacaoIdeal = await alocarTransporteOtimizado(vagasOcupadasAtuais + numAdminsAtuais, maxTranspNum, tiposDisponiveis);

        const dadosAtualizados = {
            localidadeId, data, horarioSaida: horarioSaida || null,
            despesas: despesasNum, lucroAbsoluto: lucroNum,
            ocupacaoMinima: ocupacaoMinNum, preco: precoNum,
            maximoTransportes: maxTranspNum,
            capacidadeMaximaTeorica: novaCapacidadeMaximaTeorica,
            capacidadeCalculada: novaAlocacaoIdeal.sucesso ? novaAlocacaoIdeal.capacidadeTotal : (caravanaAtual.capacidadeCalculada || 0),
            alocacaoIdealAtual: novaAlocacaoIdeal.sucesso ? novaAlocacaoIdeal.combinacao : (caravanaAtual.alocacaoIdealAtual || []),
            guiaUid: (guiaUid === "nao_confirmado" || guiaUid === "") ? null : guiaUid,
            dataConfirmacaoTransporte: dataConfirmacaoTransporte,
            dataFechamentoVendas: dataFechamentoVendas || null,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        };
        ['administradorUid', 'motoristaUid', 'transporteDefinidoManualmente', 'transporteAutoDefinido', 'capacidadeFinalizada', 'transportesFinalizados'].forEach(key => {
             if (caravanaAtual[key] !== undefined) dadosAtualizados[key] = caravanaAtual[key];
        });

        await caravanaRef.update(dadosAtualizados);
        const caravanaAtualizadaDoc = await caravanaRef.get();
        res.status(200).json({ id: caravanaAtualizadaDoc.id, ...caravanaAtualizadaDoc.data() });

    } catch (error) {
        console.error("Erro ao atualizar caravana:", error);
        res.status(500).json({ error: "Erro interno ao atualizar caravana.", details: error.message });
    }
});












// --- Rota PUT /caravanas/:id/definir-transporte (Adiciona checagem de data) ---
app.put('/caravanas/:id/definir-transporte-final', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    const { transportesFinalizados: transportesInput } = req.body; // Renomeia para clareza

    try {
        if (!Array.isArray(transportesInput)) {
            return res.status(400).json({ error: "A lista de transportes finalizados é inválida." });
        }

        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        // Usar transação para garantir consistência
        await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");

            const caravanaAtual = caravanaDoc.data();
            const vagasOcupadasClientes = caravanaAtual.vagasOcupadas || 0;

            let capacidadeFinalizadaTotal = 0;
            const tiposTransporteCache = {};
            const adminsUnicos = new Set();
            const motoristasUnicos = new Set();
            const transportesValidados = []; // Array para guardar veículos após validação

            for (const veiculo of transportesInput) {
                if (!veiculo.tipoId) throw new Error("Cada veículo na lista deve ter um tipoId.");

                let assentos = tiposTransporteCache[veiculo.tipoId];
                if (assentos === undefined) {
                    // IMPORTANTE: Idealmente, buscar tipos FORA da transação ou ter cache robusto
                    // Buscar dentro da transação pode causar contenção. Simplificação aqui:
                    const tipoDoc = await db.collection('transportes').doc(veiculo.tipoId).get(); // Leitura dentro da transação
                    if (!tipoDoc.exists) throw new Error(`Tipo de transporte com ID ${veiculo.tipoId} não encontrado.`);
                    assentos = tipoDoc.data().assentos || 0;
                    tiposTransporteCache[veiculo.tipoId] = assentos;
                }
                 if (assentos <= 0) throw new Error(`Tipo de transporte ${veiculo.nomeTipo || veiculo.tipoId} não possui assentos válidos.`);
                 capacidadeFinalizadaTotal += assentos;

                 // Validações de Funcionários (idealmente feito antes da transação ou com IDs pré-validados)
                 if (veiculo.motoristaUid) {
                     const motoristaDoc = await getFuncionarioData(veiculo.motoristaUid); // Simplificação: busca fora da transação
                     if (!motoristaDoc || motoristaDoc.cargo !== 'motorista') throw new Error(`Motorista selecionado inválido (UID: ${veiculo.motoristaUid}).`);
                     motoristasUnicos.add(veiculo.motoristaUid);
                 }
                 if (veiculo.administradorUid) {
                     const adminDoc = await getFuncionarioData(veiculo.administradorUid); // Simplificação: busca fora da transação
                     if (!adminDoc || adminDoc.cargo !== 'administrador') throw new Error(`Administrador selecionado inválido (UID: ${veiculo.administradorUid}).`);
                     adminsUnicos.add(veiculo.administradorUid);
                 }

                 transportesValidados.push({ // Adiciona ao array validado
                    tipoId: veiculo.tipoId,
                    nomeTipo: veiculo.nomeTipo || tiposTransporteCache[veiculo.tipoId]?.nome || 'Desconhecido', // Adiciona nome se não veio
                    assentos: assentos,
                    placa: veiculo.placa || null,
                    motoristaUid: veiculo.motoristaUid || null,
                    administradorUid: veiculo.administradorUid || null,
                    // participantesAtribuidos será preenchido abaixo
                 });
            }

            const numAdminsNecessarios = adminsUnicos.size > 0 ? adminsUnicos.size : (transportesValidados.length > 0 ? 1 : 0);
            const pessoasNecessarias = vagasOcupadasClientes + numAdminsNecessarios;

            if (capacidadeFinalizadaTotal < pessoasNecessarias) {
                throw new Error(`Capacidade definida (${capacidadeFinalizadaTotal}) insuficiente para ${vagasOcupadasClientes} clientes + ${numAdminsNecessarios} admin(s).`);
            }

            // --- DISTRIBUI PARTICIPANTES ---
            // Esta função busca os participantes e retorna o array de transportes com 'participantesAtribuidos' preenchido
            const transportesComAtribuicao = await distribuirParticipantes(caravanaId, transportesValidados);
            // --- FIM DISTRIBUIÇÃO ---


            const adminPrincipal = adminsUnicos.size > 0 ? [...adminsUnicos][0] : null;
            const motoristaPrincipal = motoristasUnicos.size > 0 ? [...motoristasUnicos][0] : null;

            transaction.update(caravanaRef, {
                administradorUid: adminPrincipal,
                motoristaUid: motoristaPrincipal,
                transportesFinalizados: transportesComAtribuicao, // Salva com participantes atribuídos
                capacidadeFinalizada: capacidadeFinalizadaTotal,
                transporteDefinidoManualmente: true,
                transporteAutoDefinido: false,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            });
        }); // Fim da Transação

        res.status(200).json({ message: "Definição manual de transporte e atribuição de participantes salva." });

    } catch (error) {
        console.error(`Erro ao definir transporte final para caravana ${caravanaId}:`, error);
        // Retorna o erro específico da validação ou da transação
        res.status(error.message.includes('não encontrada') || error.message.includes('inválido') || error.message.includes('insuficiente') ? 400 : 500).json({
             error: error.message || "Erro interno ao definir transporte."
        });
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


app.get('/caravanas/:caravanaId/participantes-distribuidos', verificarAutenticacao, verificarFuncionarioOuAdmin, async (req, res) => {
    const { caravanaId } = req.params;
    // Pega UID e Cargo do funcionário logado (se houver) da query string
    const { funcionarioUid, cargo } = req.query;
    const isAdminView = !funcionarioUid; // Assume que é admin se UID não for passado

    try {
        const caravanaDoc = await db.collection('caravanas').doc(caravanaId).get();
        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        const caravana = caravanaDoc.data();

        const transporteDefinido = (caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && caravana.transportesFinalizados && caravana.transportesFinalizados.length > 0;

        if (!transporteDefinido) {
            // Se não definido, retorna a lista completa para todos (admin ou funcionário)
             const participantesSnapshot = await db.collection('participantes')
                 .where('caravanaId', '==', caravanaId)
                 .orderBy('timestamp', 'desc')
                 .get();
             const todosParticipantes = await Promise.all(participantesSnapshot.docs.map(async doc => {
                 const pData = doc.data();
                 const userDoc = pData.uid ? await db.collection('users').doc(pData.uid).get() : null;
                 const userData = userDoc && userDoc.exists ? userDoc.data() : {};
                 return { id: doc.id, ...pData, nome: userData.nome || pData.nome, telefone: userData.telefone || null };
             }));
            return res.status(200).json({ definicaoCompleta: false, todosParticipantes: todosParticipantes });
        }

        // Se transporte definido, busca detalhes e filtra se necessário
        const participantesMap = new Map();
        const funcionariosMap = new Map();

        let veiculosFiltrados = [...caravana.transportesFinalizados]; // Começa com todos

        // Filtra para funcionário específico (se não for admin e não for guia)
        if (!isAdminView && cargo && cargo !== 'guia') {
            veiculosFiltrados = caravana.transportesFinalizados.filter(veiculo =>
                (cargo === 'administrador' && veiculo.administradorUid === funcionarioUid) ||
                (cargo === 'motorista' && veiculo.motoristaUid === funcionarioUid)
            );
             // Se após filtrar não sobrar nenhum veículo para este funcionário, retorna vazio
             if (veiculosFiltrados.length === 0) {
                 return res.status(200).json({ definicaoCompleta: true, veiculosComParticipantes: [] });
             }
        }
        // Guias e Admins verão todos os veículos definidos

        const veiculosComParticipantesDetalhados = await Promise.all(
            veiculosFiltrados.map(async (veiculo) => { // Itera sobre os veículos filtrados (ou todos)
                const participantesAtribuidosDetalhes = [];
                if (veiculo.participantesAtribuidos && Array.isArray(veiculo.participantesAtribuidos)) {
                    // Cria um Set para buscar cada participante apenas uma vez
                    const participantesIdsUnicos = [...new Set(veiculo.participantesAtribuidos)];

                    for (const participanteDocId of participantesIdsUnicos) {
                        let participanteDetalhe = participantesMap.get(participanteDocId);
                        if (!participanteDetalhe) {
                            const pDoc = await db.collection('participantes').doc(participanteDocId).get();
                            if (pDoc.exists) {
                                participanteDetalhe = { id: pDoc.id, ...pDoc.data() };
                                // Busca nome/telefone do usuário
                                const userDoc = participanteDetalhe.uid ? await db.collection('users').doc(participanteDetalhe.uid).get() : null;
                                const userData = userDoc && userDoc.exists ? userDoc.data() : {};
                                participanteDetalhe.nome = userData.nome || participanteDetalhe.nome;
                                participanteDetalhe.telefone = userData.telefone || null;

                                participantesMap.set(participanteDocId, participanteDetalhe);
                            }
                        }
                        if (participanteDetalhe) participantesAtribuidosDetalhes.push(participanteDetalhe);
                    }
                    // Ordena por nome após buscar detalhes
                    participantesAtribuidosDetalhes.sort((a, b) => a.nome.localeCompare(b.nome));
                }

                 let adminData = null;
                 if (veiculo.administradorUid) {
                     adminData = funcionariosMap.get(veiculo.administradorUid) || await getFuncionarioData(veiculo.administradorUid);
                     if(adminData) funcionariosMap.set(veiculo.administradorUid, adminData);
                 }
                 let motoristaData = null;
                 if (veiculo.motoristaUid) {
                     motoristaData = funcionariosMap.get(veiculo.motoristaUid) || await getFuncionarioData(veiculo.motoristaUid);
                     if(motoristaData) funcionariosMap.set(veiculo.motoristaUid, motoristaData);
                 }

                return {
                    veiculoInfo: {
                        tipoId: veiculo.tipoId, nomeTipo: veiculo.nomeTipo,
                        assentos: veiculo.assentos, placa: veiculo.placa
                    },
                    administrador: adminData ? { uid: adminData.id, nome: adminData.nome } : null,
                    motorista: motoristaData ? { uid: motoristaData.id, nome: motoristaData.nome } : null,
                    participantesAtribuidos: participantesAtribuidosDetalhes
                };
            })
        );

        res.status(200).json({
            definicaoCompleta: true,
            veiculosComParticipantes: veiculosComParticipantesDetalhados
        });

    } catch (error) {
        console.error(`Erro ao buscar participantes distribuídos da caravana ${caravanaId}:`, error);
        res.status(500).json({ error: "Erro interno ao buscar participantes distribuídos." });
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
    let alocacaoAntes = null;
    let alocacaoDepois = null;
    let caravanaDataParaEmail = null;

    try {
        if (!caravanaId || !quantidade) return res.status(400).json({ error: "ID da caravana e quantidade são obrigatórios." });
        const quantidadeNumerica = parseInt(quantidade, 10);
        if (isNaN(quantidadeNumerica) || quantidadeNumerica <= 0) return res.status(400).json({ error: "Quantidade inválida." });

        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        const participantesRef = db.collection('participantes').doc();
        const tiposTransporteRef = db.collection('transportes');

        await db.runTransaction(async (transaction) => {
            const [caravanaDoc, tiposSnapshot] = await Promise.all([
                transaction.get(caravanaRef),
                transaction.get(tiposTransporteRef)
            ]);

            if (!caravanaDoc.exists) throw new Error('Caravana não encontrada.');
            const caravana = caravanaDoc.data();
            caravanaDataParaEmail = { ...caravana, id: caravanaId };

            if (!caravana.transporteDefinidoManualmente && !caravana.transporteAutoDefinido) {
                 alocacaoAntes = caravana.alocacaoIdealAtual || [];
            }

            if (caravana.status === 'cancelada') throw new Error('Esta caravana foi cancelada.');
            const hoje = new Date();
            const dataViagem = new Date(caravana.data + 'T00:00:00Z');
            if (dataViagem < hoje.setUTCHours(0, 0, 0, 0)) throw new Error('Esta caravana já ocorreu.');
            const dataFechamento = caravana.dataFechamentoVendas ? new Date(caravana.dataFechamentoVendas + 'T23:59:59Z') : null;
            if (dataFechamento && hoje > dataFechamento) throw new Error(`As vendas foram encerradas em ${formatDate(caravana.dataFechamentoVendas)}.`);

            const capacidadeParaVenda = caravana.transporteDefinidoManualmente
                                      ? (caravana.capacidadeFinalizada || 0)
                                      : (caravana.transporteAutoDefinido
                                          ? (caravana.capacidadeFinalizada || 0)
                                          : (caravana.capacidadeMaximaTeorica || 0));

            const vagasOcupadasCliente = caravana.vagasOcupadas || 0;

            if (capacidadeParaVenda <= 0) {
                 throw new Error('A capacidade desta caravana não foi definida. Venda indisponível.');
            }

            let numAdminsConsiderados = 0;
            if ((caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && Array.isArray(caravana.transportesFinalizados)) {
                 numAdminsConsiderados = Math.min(capacidadeParaVenda, caravana.transportesFinalizados.length);
            } else if (capacidadeParaVenda > 0) {
                 numAdminsConsiderados = Math.min(capacidadeParaVenda, caravana.maximoTransportes || 0);
            }

            const vagasDisponiveisCliente = Math.max(0, capacidadeParaVenda - vagasOcupadasCliente - numAdminsConsiderados);

            if (quantidadeNumerica > vagasDisponiveisCliente) {
                const msgErroVagas = vagasDisponiveisCliente <= 0
                    ? `Vagas esgotadas para clientes (Capacidade: ${capacidadeParaVenda}, Admins: ${numAdminsConsiderados}).`
                    : `Não há vagas suficientes. Apenas ${vagasDisponiveisCliente} vaga(s) disponível(is) para clientes.`;
                throw new Error(msgErroVagas);
            }

            let updateData = {
                 vagasOcupadas: admin.firestore.FieldValue.increment(quantidadeNumerica)
            };

            if (!caravana.transporteDefinidoManualmente && !caravana.transporteAutoDefinido) {
                const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const maxVeiculos = caravana.maximoTransportes || 0;
                const pessoasParaAlocarAposCompra = vagasOcupadasCliente + quantidadeNumerica + numAdminsConsiderados; // Usa admins atuais/teóricos

                if (maxVeiculos > 0 && tiposDisponiveis.length > 0) {
                    const novaAlocacao = await alocarTransporteOtimizado(pessoasParaAlocarAposCompra, maxVeiculos, tiposDisponiveis);
                    if (novaAlocacao.sucesso) {
                        alocacaoDepois = novaAlocacao.combinacao;
                        updateData.capacidadeCalculada = novaAlocacao.capacidadeTotal;
                        updateData.alocacaoIdealAtual = novaAlocacao.combinacao;
                        caravanaDataParaEmail.capacidadeCalculada = novaAlocacao.capacidadeTotal; // Atualiza para email
                    } else {
                         console.warn(`[Compra ${caravanaId}] Falha ao recalcular alocação ideal.`);
                         alocacaoDepois = alocacaoAntes;
                    }
                } else {
                     alocacaoDepois = alocacaoAntes;
                }
            } else {
                alocacaoDepois = alocacaoAntes;
            }

            transaction.update(caravanaRef, updateData);
            transaction.set(participantesRef, {
                caravanaId, email: usuarioEmail, nome: usuarioNome || null,
                uid: usuarioId, quantidade: quantidadeNumerica,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // --- LÓGICA DE EMAIL ---
        try {
            const localidadeInfo = await getLocalidadeData(caravanaDataParaEmail.localidadeId);
            const nomeLocalidadeFinal = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';

            const emailCompraSubject = `Confirmação de Compra - Caravana para ${nomeLocalidadeFinal}`;
            const emailCompraHtml = `
                <p>Olá ${usuarioNome || ''}!</p>
                <p>Sua compra de ${quantidadeNumerica} ingresso(s) para a caravana com destino a <strong>${nomeLocalidadeFinal}</strong> na data ${formatDate(caravanaDataParaEmail.data)} foi realizada com sucesso!</p>
                <p>Horário de Saída Previsto: ${caravanaDataParaEmail.horarioSaida || 'A definir'}</p>
                <p>Detalhes sobre o transporte e ponto de encontro serão enviados mais próximo à data da viagem.</p>
                <p>Agradecemos a preferência!</p>
                <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
            `;
            await sendEmail(usuarioEmail, emailCompraSubject, emailCompraHtml);
             console.log(`[${caravanaId}] Email de confirmação de compra enviado para ${usuarioEmail}.`);
        } catch (emailCompraError) {
            console.error(`[${caravanaId}] Falha ao enviar email de confirmação de compra para ${usuarioEmail}:`, emailCompraError);
        }

        if (alocacaoAntes !== null && alocacaoDepois !== null && alocacoesDiferentes(alocacaoAntes, alocacaoDepois)) {
            console.log(`[${caravanaId}] Alocação ideal alterada. Enviando email para admin...`);
            try {
                 const localidadeInfo = await getLocalidadeData(caravanaDataParaEmail.localidadeId);
                 const nomeLocalidadeFinal = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';

                const formatarAlocacaoParaEmail = (aloc) => {
                    if (!aloc || aloc.length === 0) return "<li>Nenhuma sugestão anterior ou cálculo falhou.</li>";
                    return aloc.map(item => `<li>${item.quantidade}x ${item.nomeTipo} (${item.assentos} assentos)</li>`).join('');
                };

                const emailSubjectAdmin = `Alerta: Alocação Sugerida Alterada - ${nomeLocalidadeFinal} (${formatDate(caravanaDataParaEmail.data)})`;
                const emailHtmlAdmin = `
                    <p>Olá Administrador,</p>
                    <p>A alocação de transporte ideal sugerida para a caravana <strong>${nomeLocalidadeFinal}</strong> (Data: ${formatDate(caravanaDataParaEmail.data)}) foi recalculada devido a uma nova compra.</p>
                    <p>Data final para definição: <strong>${formatDate(caravanaDataParaEmail.dataConfirmacaoTransporte)}</strong>.</p>
                    <hr><p><strong>Alocação Anterior Sugerida:</strong></p><ul>${formatarAlocacaoParaEmail(alocacaoAntes)}</ul>
                    <hr><p><strong>Nova Alocação Sugerida:</strong></p>
                    <ul>
                        ${formatarAlocacaoParaEmail(alocacaoDepois)}
                        <li>Capacidade Total Sugerida: ${caravanaDataParaEmail.capacidadeCalculada || 'N/A'}</li>
                    </ul><hr>
                    <p>Verifique e defina o transporte manualmente se necessário antes da data limite.</p>
                `;

                await sendEmail(process.env.ADMIN_EMAIL, emailSubjectAdmin, emailHtmlAdmin);
                console.log(`[${caravanaId}] Email de alteração de alocação enviado para admin.`);

            } catch (emailAdminError) {
                console.error(`[${caravanaId}] Falha ao enviar email de alteração de alocação para admin:`, emailAdminError);
            }
        }
        // --- FIM LÓGICA DE EMAIL ---

        res.status(200).json({ message: `${quantidadeNumerica} ingresso(s) comprado(s) com sucesso!`});

    } catch (error) {
        console.error(`Erro ao comprar ingresso para caravana ${caravanaId}:`, error);
        if (error.message.includes('não encontrada') || error.message.includes('cancelada') || error.message.includes('ocorreu') || error.message.includes('encerradas') || error.message.includes('capacidade') || error.message.includes('Vagas esgotadas') || error.message.includes('suficientes') || error.message.includes('Nenhum tipo') || error.message.includes('combinação de transporte')) {
             res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Erro interno ao processar a compra.', details: error.message });
        }
    }
});















// Rota para buscar os participantes de uma caravana específica (requer admin ou permissão específica)
// app.get('/participantes/:caravanaId', verificarAutenticacao, verificarFuncionarioOuAdmin, async (req, res) => {
//     const { caravanaId } = req.params;
//     let participantes = [];

//     try {
//         const caravanaDoc = await db.collection('caravanas').doc(caravanaId).get();
//          if (!caravanaDoc.exists) {
//              return res.status(404).json({ error: 'Caravana não encontrada.' });
//          }

//         const participantesSnapshot = await db.collection('participantes')
//             .where('caravanaId', '==', caravanaId)
//             .orderBy('timestamp', 'desc') 
//             .get();

//         for (const doc of participantesSnapshot.docs) {
//             const participante = doc.data();
//             let usuarioData = {};

//             if (participante.uid) {
//                 try {
//                     const usuarioDoc = await db.collection('users').doc(participante.uid).get();
//                     if (usuarioDoc.exists) {
//                         const uData = usuarioDoc.data();
//                         usuarioData = {
//                             nome: uData.nome || participante.nome,
//                             telefone: uData.telefone,
//                         };
//                     } else {
//                          usuarioData = { nome: participante.nome || "Usuário não encontrado", telefone: "N/A" };
//                     }
//                 } catch (userError) {
//                     console.error("Erro ao buscar detalhes do usuário:", participante.uid, userError);
//                     usuarioData = { nome: participante.nome || "Erro ao buscar usuário", telefone: "N/A" };
//                 }
//             } else {
//                 usuarioData = { nome: participante.nome || "UID Ausente", telefone: "N/A" };
//             }

//             participantes.push({
//                 id: doc.id, 
//                 uid: participante.uid,
//                 email: participante.email,
//                 quantidade: participante.quantidade,
//                 timestamp: participante.timestamp, 
//                 ...usuarioData, 
//             });
//         }

//         res.status(200).json(participantes);

//     } catch (error) {
//         console.error(`Erro ao buscar participantes da caravana ${caravanaId}:`, error);
//         res.status(500).json({ error: "Erro interno ao buscar participantes." });
//     }
// });


// server.js

// --- ROTAS DE TRANSPORTES ---

app.post('/transportes', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        // Removido 'placa'. Mantido 'fornecedor' (opcional?).
        const { nome, assentos, fornecedor, imagemUrl } = req.body;

        // Validação básica
        if (!nome || !assentos) { // Fornecedor se torna opcional aqui? Ajuste se necessário.
            return res.status(400).json({ error: "Nome e Assentos são obrigatórios para o tipo de veículo." });
        }
        const assentosNum = parseInt(assentos, 10);
        if (isNaN(assentosNum) || assentosNum <= 0) {
            return res.status(400).json({ error: "Número de assentos inválido." });
        }

        // Verificar se já existe um tipo com o mesmo nome (importante para tipos)
        const nomeCheck = await db.collection('transportes').where('nome', '==', nome).limit(1).get();
        if (!nomeCheck.empty) {
            return res.status(400).json({ error: `Já existe um tipo de veículo chamado "${nome}".` });
        }

        const novoTipoTransporte = {
            nome, // Ex: "Ônibus Leito", "Van Executiva"
            assentos: assentosNum,
            fornecedor: fornecedor || null, // Fornecedor associado ao tipo (opcional)
            imagemUrl: imagemUrl || null, // Imagem representativa do tipo
            // Removido 'placa' e 'disponivel'
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('transportes').add(novoTipoTransporte);
        res.status(201).json({ id: docRef.id, ...novoTipoTransporte });

    } catch (error) {
        console.error("Erro ao criar tipo de transporte:", error);
        res.status(500).json({ error: "Erro interno ao criar tipo de transporte.", details: error.message });
    }
});

// GET /transportes - Listar todos os TIPOS de veículos
app.get('/transportes', verificarAutenticacao, verificarFuncionarioOuAdmin, async (req, res) => {
    try {
        // Ordena por nome ou assentos, como preferir
        const snapshot = await db.collection('transportes').orderBy('nome').get();
        const tiposTransporte = [];
        snapshot.forEach(doc => {
            tiposTransporte.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(tiposTransporte);
    } catch (error) {
        console.error("Erro ao listar tipos de transporte:", error);
        res.status(500).json({ error: "Erro interno ao listar tipos de transporte." });
    }
});

// PUT /transportes/:id - Atualizar um TIPO de veículo existente
app.put('/transportes/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Removido 'placa' e 'disponivel'
        const { nome, assentos, fornecedor, imagemUrl } = req.body;

        const transporteRef = db.collection('transportes').doc(id);
        const docSnap = await transporteRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: "Tipo de veículo não encontrado." });
        }

        const dadosAtuais = docSnap.data();
        const dadosAtualizados = {};
        let hasUpdate = false;

        if (nome !== undefined) {
            if (!nome) return res.status(400).json({ error: "Nome não pode ser vazio." });
            // Verificar se o novo nome já existe em outro tipo
            if (nome !== dadosAtuais.nome) {
                const nomeCheck = await db.collection('transportes').where('nome', '==', nome).limit(1).get();
                if (!nomeCheck.empty && nomeCheck.docs[0].id !== id) {
                    return res.status(400).json({ error: `Já existe outro tipo de veículo chamado "${nome}".` });
                }
            }
            dadosAtualizados.nome = nome; hasUpdate = true;
        }
        if (assentos !== undefined) {
            const n = parseInt(assentos, 10);
            if (isNaN(n) || n <= 0) return res.status(400).json({ error: "Número de assentos inválido." });
            dadosAtualizados.assentos = n; hasUpdate = true;
        }
        if (fornecedor !== undefined) { // Permite definir como null ou string
            dadosAtualizados.fornecedor = fornecedor; hasUpdate = true;
        }
        if (imagemUrl !== undefined) { // Permite definir como null ou string
            dadosAtualizados.imagemUrl = imagemUrl; hasUpdate = true;
        }
        // Removida lógica de 'disponivel'

        if (!hasUpdate) {
            return res.status(400).json({ error: "Nenhum dado válido para atualizar foi fornecido." });
        }

        dadosAtualizados.lastUpdate = admin.firestore.FieldValue.serverTimestamp();
        await transporteRef.update(dadosAtualizados);

        const updatedDoc = await transporteRef.get();
        res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });

    } catch (error) {
        console.error(`Erro ao atualizar tipo de transporte ${req.params.id}:`, error);
        res.status(500).json({ error: "Erro interno ao atualizar tipo de transporte.", details: error.message });
    }
});

// DELETE /transportes/:id - Excluir um TIPO de veículo
app.delete('/transportes/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const transporteRef = db.collection('transportes').doc(id);
        const docSnap = await transporteRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: "Tipo de veículo não encontrado." });
        }

        // **Verificar se o TIPO está sendo usado em alguma alocação de caravana ativa/futura**
        // Isso requer buscar em 'caravanas' onde o array 'transportesAlocados' contenha um obj com este id.
        // Firestore não facilita query direta em objetos dentro de arrays.
        // Alternativa: Iterar sobre caravanas ativas (pode ser lento) ou ter uma estrutura melhor.
        // Simplificação por agora: Vamos assumir que a lógica de alocação impede usar um tipo inválido.
        // **ALERTA:** Implementar uma verificação robusta aqui é CRUCIAL em produção para evitar
        // que caravanas fiquem sem um tipo de transporte válido após a exclusão.
        // Exemplo de como *poderia* ser (requer ajuste na sua estrutura de dados de caravana se 'transportesAlocados' não for um array de objetos com 'id'):
        /*
        const hoje = new Date().toISOString().split('T')[0];
        const caravanasQuery = db.collection('caravanas')
                                  .where('data', '>=', hoje) // Futuras ou hoje
                                  .where('status', 'in', ['confirmada', 'nao_confirmada']); // Status ativos

        const caravanasSnap = await caravanasQuery.get();
        let tipoEmUso = false;
        let caravanaUsandoInfo = '';

        caravanasSnap.forEach(caravanaDoc => {
            const caravanaData = caravanaDoc.data();
            // ASSUMINDO que transportesAlocados é um array de objetos como { id: '...', nome: '...', ... }
            if (Array.isArray(caravanaData.transportesAlocados)) {
                if (caravanaData.transportesAlocados.some(t => t.id === id)) {
                    tipoEmUso = true;
                    caravanaUsandoInfo = `Caravana para ${caravanaData.localidadeId || 'Local Desconhecido'} em ${formatDate(caravanaData.data)}`; // Use sua função formatDate
                    return; // Sai do forEach se encontrar
                }
            }
        });

        if (tipoEmUso) {
             return res.status(400).json({ error: `Não é possível excluir. Este tipo de veículo está alocado em pelo menos uma caravana ativa/futura (${caravanaUsandoInfo}).` });
        }
        */

        // Se passou na verificação (ou se a verificação robusta não foi implementada ainda)
        await transporteRef.delete();
        res.status(204).send();

    } catch (error) {
        console.error(`Erro ao excluir tipo de transporte ${req.params.id}:`, error);
        // Se o erro for da verificação de uso, pode ser um 400 ou 500 dependendo da implementação
        res.status(500).json({ error: "Erro interno ao excluir tipo de transporte." });
    }
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



app.put('/caravanas/:id/definir-transporte-final', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    const { transportesFinalizados: transportesInput } = req.body;
    let caravanaParaEmail = null;
    let transportesSalvosComAtribuicao = null; // Para usar no email

    try {
        if (!Array.isArray(transportesInput)) {
            return res.status(400).json({ error: "A lista de transportes finalizados é inválida." });
        }

        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) throw new Error("Caravana não encontrada.");
            const caravanaAtual = caravanaDoc.data();
            caravanaParaEmail = { ...caravanaAtual, id: caravanaId }; // Guarda dados pré-atualização
            const vagasOcupadasClientes = caravanaAtual.vagasOcupadas || 0;

            let capacidadeFinalizadaTotal = 0;
            const tiposTransporteCache = {};
            const adminsUnicos = new Set();
            const motoristasUnicos = new Set();
            const transportesValidados = [];

            for (const veiculo of transportesInput) {
                // ... (Validação dos veículos como antes - omitido por brevidade) ...
                if (!veiculo.tipoId) throw new Error("Cada veículo na lista deve ter um tipoId.");
                let tipoInfo = tiposTransporteCache[veiculo.tipoId];
                if (!tipoInfo) {
                    const tipoDoc = await db.collection('transportes').doc(veiculo.tipoId).get();
                    if (!tipoDoc.exists) throw new Error(`Tipo ${veiculo.tipoId} não encontrado.`);
                    tipoInfo = tipoDoc.data();
                    tiposTransporteCache[veiculo.tipoId] = tipoInfo;
                }
                const assentos = tipoInfo.assentos || 0;
                if (assentos <= 0) throw new Error(`Tipo ${veiculo.nomeTipo || veiculo.tipoId} sem assentos.`);
                capacidadeFinalizadaTotal += assentos;
                if (veiculo.motoristaUid) motoristasUnicos.add(veiculo.motoristaUid);
                if (veiculo.administradorUid) adminsUnicos.add(veiculo.administradorUid);
                transportesValidados.push({
                    tipoId: veiculo.tipoId, nomeTipo: veiculo.nomeTipo || tipoInfo.nome || 'Desconhecido',
                    assentos: assentos, placa: veiculo.placa || null, motoristaUid: veiculo.motoristaUid || null,
                    administradorUid: veiculo.administradorUid || null,
                 });
            }

            const numAdminsNecessarios = transportesValidados.length;
            const pessoasNecessarias = vagasOcupadasClientes + numAdminsNecessarios;
            if (capacidadeFinalizadaTotal < pessoasNecessarias) {
                throw new Error(`Capacidade (${capacidadeFinalizadaTotal}) insuficiente para ${vagasOcupadasClientes} clientes + ${numAdminsNecessarios} admin(s).`);
            }

            transportesSalvosComAtribuicao = await distribuirParticipantes(caravanaId, transportesValidados); // <<< Guarda o resultado
            const adminPrincipal = adminsUnicos.size > 0 ? [...adminsUnicos][0] : null;
            const motoristaPrincipal = motoristasUnicos.size > 0 ? [...motoristasUnicos][0] : null;

            transaction.update(caravanaRef, {
                administradorUid: adminPrincipal, motoristaUid: motoristaPrincipal,
                transportesFinalizados: transportesSalvosComAtribuicao, // Salva com atribuição
                capacidadeFinalizada: capacidadeFinalizadaTotal,
                transporteDefinidoManualmente: true, transporteAutoDefinido: false,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // --- Envio de Email aos Participantes (APÓS a transação e DEFINIÇÃO MANUAL) ---
        if (transportesSalvosComAtribuicao) { // Só envia se a definição foi salva
            try {
                // Busca todos os participantes da caravana uma vez
                const participantesSnapshot = await db.collection('participantes').where('caravanaId', '==', caravanaId).get();
                if (!participantesSnapshot.empty) {
                    const localidadeInfo = await getLocalidadeData(caravanaParaEmail.localidadeId);
                    const nomeLocalidade = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';
                    const emailSubject = `Transporte Confirmado - Caravana ${nomeLocalidade} (${formatDate(caravanaParaEmail.data)})`;

                    console.log(`[${caravanaId}] Preparando ${participantesSnapshot.size} emails de confirmação de transporte (Manual)...`);

                    for (const participanteDoc of participantesSnapshot.docs) {
                        const participante = participanteDoc.data();
                        const participanteId = participanteDoc.id;

                        // Encontra em qual veículo este participante foi alocado
                        let veiculoAtribuido = null;
                        let indiceVeiculo = -1;
                        for(let i = 0; i < transportesSalvosComAtribuicao.length; i++) {
                            if(transportesSalvosComAtribuicao[i].participantesAtribuidos?.includes(participanteId)) {
                                veiculoAtribuido = transportesSalvosComAtribuicao[i];
                                indiceVeiculo = i + 1; // Índice baseado em 1 para o usuário
                                break;
                            }
                        }

                        let transporteDesc = `Transporte ${indiceVeiculo}: ${veiculoAtribuido?.nomeTipo || 'Tipo não informado'}.`;
                        if (!veiculoAtribuido) {
                             transporteDesc = "Seu veículo será confirmado em breve."; // Fallback caso algo dê errado na atribuição
                             console.warn(`Participante ${participanteId} não encontrado em nenhum veículo atribuído para caravana ${caravanaId}`);
                        }

                        const emailHtml = `
                            <p>Olá!</p>
                            <p>Boas notícias! O transporte para a caravana com destino a <strong>${nomeLocalidade}</strong> na data <strong>${formatDate(caravanaParaEmail.data)}</strong> foi confirmado.</p>
                            <p>Você foi alocado(a) no ${transporteDesc}</p>
                            <p>Horário de Saída Previsto: ${caravanaParaEmail.horarioSaida || 'A definir'}</p>
                            <p>Informações sobre o ponto de encontro exato e outras instruções serão enviadas mais próximo à data.</p>
                            <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                        `;
                        await sendEmail(participante.email, emailSubject, emailHtml);
                    }
                     console.log(`[${caravanaId}] Emails de confirmação de transporte (Manual) enviados.`);
                }
            } catch (emailError) {
                 console.error(`[${caravanaId}] Erro ao enviar emails de confirmação de transporte (Manual):`, emailError);
            }
        }
        // --- Fim Envio de Email ---

        res.status(200).json({ message: "Definição manual de transporte e atribuição de participantes salva." });

    } catch (error) {
        console.error(`Erro ao definir transporte final para caravana ${caravanaId}:`, error);
        res.status(error.message.includes('não encontrada') || error.message.includes('inválido') || error.message.includes('insuficiente') ? 400 : 500).json({
             error: error.message || "Erro interno ao definir transporte."
        });
    }
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
    console.log('[CRON] Executando confirmação/cancelamento Pós-Vendas...');
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const dataOntemStr = ontem.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    try {
        const caravanasPendentesSnap = await db.collection('caravanas')
            .where('dataFechamentoVendas', '==', dataOntemStr) // Vendas fecharam ontem
            .where('status', '==', 'nao_confirmada') // Apenas as não confirmadas
            .get();

        if (caravanasPendentesSnap.empty) {
            console.log('[CRON] Nenhuma caravana pós-vendas para confirmar/cancelar.');
            return;
        }

        console.log(`[CRON] Verificando ${caravanasPendentesSnap.size} caravanas pós-vendas.`);

        for (const doc of caravanasPendentesSnap.docs) {
            const caravanaId = doc.id;
            const caravana = doc.data();
            const caravanaRef = db.collection('caravanas').doc(caravanaId);

            const ocupacaoMinima = caravana.ocupacaoMinima || 0;
            const vagasOcupadas = caravana.vagasOcupadas || 0;

            // Condição 1: Atingiu Ocupação Mínima?
            const ocupacaoAtingida = vagasOcupadas >= ocupacaoMinima;

            // Condição 2: Transporte Definido e Completo?
            let transporteCompleto = false;
            if (caravana.transporteDefinidoManualmente === true && // Precisa ser definido manualmente
                Array.isArray(caravana.transportesFinalizados) &&
                caravana.transportesFinalizados.length > 0)
            {
                // Verifica se TODOS os veículos na definição manual têm placa E motorista
                transporteCompleto = caravana.transportesFinalizados.every(
                    veiculo => veiculo.placa && veiculo.motoristaUid
                    // Não precisa checar admin aqui, pois a regra é ter placa e motorista
                );
            }

            let updateData = {
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            };
            let motivo = '';
            let enviarNotificacaoConfirmacao = false;
            let enviarNotificacaoCancelamento = false;

            if (ocupacaoAtingida && transporteCompleto) {
                // CONFIRMAR
                updateData.status = 'confirmada';
                updateData.confirmadaEm = admin.firestore.FieldValue.serverTimestamp(); // Opcional: marcar quando confirmou
                motivo = 'Confirmada automaticamente: ocupação mínima atingida e transporte definido.';
                enviarNotificacaoConfirmacao = true;
                console.log(`[CRON] ${caravanaId}: Confirmando - Ocupação (${vagasOcupadas}/${ocupacaoMinima}), Transporte Completo.`);
            } else {
                // CANCELAR
                updateData.status = 'cancelada';
                if (!ocupacaoAtingida && !transporteCompleto) {
                    motivo = 'Cancelada automaticamente: ocupação mínima não atingida e transporte não definido/completo.';
                } else if (!ocupacaoAtingida) {
                    motivo = 'Cancelada automaticamente: ocupação mínima não atingida.';
                } else { // !transporteCompleto
                    motivo = 'Cancelada automaticamente: transporte definido, mas faltam detalhes (placa/motorista) em algum veículo.';
                }
                updateData.motivoCancelamento = motivo;
                enviarNotificacaoCancelamento = true;
                console.log(`[CRON] ${caravanaId}: Cancelando - Ocupação (${vagasOcupadas}/${ocupacaoMinima}), Transporte Completo (${transporteCompleto}). Motivo: ${motivo}`);
            }

            // Atualiza o status no Firestore
            try {
                await caravanaRef.update(updateData);

                // Enviar notificações após atualizar o status
                // (Adapte as funções buscarParticipantesParaNotificacao e sendEmail)
                /*
                if (enviarNotificacaoConfirmacao) {
                    const participantes = await buscarParticipantesParaNotificacao(caravanaId);
                    // Enviar email de confirmação para participantes
                } else if (enviarNotificacaoCancelamento) {
                    const participantes = await buscarParticipantesParaNotificacao(caravanaId);
                     // Enviar email de cancelamento para participantes
                }
                */

            } catch (updateError) {
                console.error(`[CRON] Erro ao atualizar status da caravana ${caravanaId}:`, updateError);
            }
        }
        console.log('[CRON] Verificação pós-vendas concluída.');
    } catch (error) {
        console.error('[CRON] Erro GERAL na tarefa de confirmação/cancelamento pós-vendas:', error);
    }
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


const finalizarTransporteAutomaticamente = async () => {
    console.log('[CRON] Executando finalização automática de transporte...');
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const dataOntemStr = ontem.toISOString().split('T')[0];

    try {
        const caravanasParaFinalizarSnap = await db.collection('caravanas')
            .where('dataConfirmacaoTransporte', '==', dataOntemStr)
            .where('transporteDefinidoManualmente', '==', false)
            .where('transporteAutoDefinido', '==', false)
            .where('status', 'in', ['confirmada', 'nao_confirmada'])
            .get();

        if (caravanasParaFinalizarSnap.empty) {
            console.log('[CRON] Nenhuma caravana para finalização automática hoje.');
            return;
        }

        console.log(`[CRON] Encontradas ${caravanasParaFinalizarSnap.size} caravanas para finalizar transporte.`);
        const tiposSnapshot = await db.collection('transportes').get();
        const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (tiposDisponiveis.length === 0) {
            console.error("[CRON] Nenhum tipo de transporte encontrado.");
            return;
        }

        for (const doc of caravanasParaFinalizarSnap.docs) {
            const caravanaId = doc.id;
            const caravana = doc.data(); // Dados da caravana ANTES da atualização
            const caravanaRef = db.collection('caravanas').doc(caravanaId);
            const vagasOcupadas = caravana.vagasOcupadas || 0;
            const maxVeiculos = caravana.maximoTransportes || 0;
            const pessoasParaAlocacao = vagasOcupadas + 1;

            console.log(`[CRON] Processando ${caravanaId}: ${vagasOcupadas} clientes, ${maxVeiculos} max veículos.`);

            const alocacaoFinal = await alocarTransporteOtimizado(pessoasParaAlocacao, maxVeiculos, tiposDisponiveis);
            let transportesComAtribuicao = null; // Para usar no email do admin
            let capacidadeFinalCalculada = 0;

            if (alocacaoFinal.sucesso) {
                capacidadeFinalCalculada = alocacaoFinal.capacidadeTotal;
                let transportesBase = alocacaoFinal.combinacao.flatMap(item =>
                    Array.from({ length: item.quantidade }, () => ({
                        tipoId: item.tipoId, nomeTipo: item.nomeTipo, assentos: item.assentos,
                        placa: null, motoristaUid: null, administradorUid: null
                    }))
                );

                const numAdminsFinais = transportesBase.length;
                if (capacidadeFinalCalculada < (vagasOcupadas + numAdminsFinais)) {
                     console.error(`[CRON] ERRO LÓGICO ${caravanaId}: Cap Final ${capacidadeFinalCalculada} < Vagas ${vagasOcupadas} + Admins ${numAdminsFinais}. Cancelando.`);
                      // Cancela a caravana se a capacidade não for suficiente
                      await caravanaRef.update({
                          status: 'cancelada',
                          motivoCancelamento: `Erro interno: Capacidade (${capacidadeFinalCalculada}) insuficiente para ${vagasOcupadas} clientes + ${numAdminsFinais} admin(s) após alocação automática.`,
                          transporteAutoDefinido: true, // Marca como tentado
                          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                      });
                       // Enviar email de cancelamento (lógica omitida para brevidade, mas importante)
                     continue;
                 }

                transportesComAtribuicao = await distribuirParticipantes(caravanaId, transportesBase);

                console.log(`[CRON] ${caravanaId}: Alocado ${JSON.stringify(alocacaoFinal.combinacao)}, Capacidade ${capacidadeFinalCalculada}. Atualizando Firestore...`);
                try {
                    await caravanaRef.update({
                        transportesFinalizados: transportesComAtribuicao,
                        capacidadeFinalizada: capacidadeFinalCalculada,
                        transporteAutoDefinido: true,
                        transporteDefinidoManualmente: false,
                        ...(caravana.status === 'nao_confirmada' && vagasOcupadas >= (caravana.ocupacaoMinima || 0) && { status: 'confirmada' }),
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[CRON] ${caravanaId}: Transporte finalizado automaticamente.`);

                    // --- Envio de Email APENAS para o Admin ---
                    try {
                         const localidadeInfo = await getLocalidadeData(caravana.localidadeId);
                         const nomeLocalidade = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';
                         const emailSubjectAdmin = `Ação Necessária: Transporte Definido Automaticamente - ${nomeLocalidade} (${formatDate(caravana.data)})`;

                         const formatarVeiculosParaAdmin = (veiculos) => {
                             if (!veiculos || veiculos.length === 0) return "<li>Nenhum veículo definido.</li>";
                             return veiculos.map((v, i) => `<li>Veículo ${i + 1}: ${v.nomeTipo} (${v.assentos} assentos) - ${v.participantesAtribuidos?.length || 0} participantes atribuídos</li>`).join('');
                         };

                         const emailHtmlAdmin = `
                             <p>Olá Administrador,</p>
                             <p>O sistema definiu automaticamente os veículos para a caravana <strong>${nomeLocalidade}</strong> (Data: ${formatDate(caravana.data)}) com base nos participantes inscritos.</p>
                             <p><strong>Veículos Definidos Automaticamente:</strong></p>
                             <ul>
                                ${formatarVeiculosParaAdmin(transportesComAtribuicao)}
                             </ul>
                             <p><strong>Capacidade Final:</strong> ${capacidadeFinalCalculada}</p>
                             <p><strong>Ação Necessária:</strong> Por favor, acesse o painel administrativo para:</p>
                             <ul>
                                 <li>Revisar a alocação de veículos (e alterar se necessário).</li>
                                 <li>Atribuir Placas.</li>
                                 <li>Atribuir Motoristas para cada veículo.</li>
                                 <li>Atribuir Administradores responsáveis por cada veículo.</li>
                             </ul>
                             <p>Atenciosamente,<br/>Sistema Caravana da Boa Viagem</p>
                         `;
                         await sendEmail(process.env.ADMIN_EMAIL, emailSubjectAdmin, emailHtmlAdmin);
                         console.log(`[CRON ${caravanaId}] Email de notificação de definição automática enviado para admin.`);
                    } catch (emailError) {
                         console.error(`[CRON ${caravanaId}] Erro ao enviar email para admin (Auto):`, emailError);
                    }
                    // --- Fim Envio de Email para Admin ---

                } catch (updateError) {
                     console.error(`[CRON] Erro ao ATUALIZAR ${caravanaId}:`, updateError);
                }

            } else { // Falha na alocação
                 console.error(`[CRON] FALHA alocar ${caravanaId}: ${alocacaoFinal.erro}`);
                 try {
                      await caravanaRef.update({
                          status: 'cancelada',
                          motivoCancelamento: `Falha na alocação automática: ${alocacaoFinal.erro}`,
                          transporteAutoDefinido: true,
                          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                      });
                      console.log(`[CRON] ${caravanaId}: Cancelada por falha na alocação.`);
                      // Enviar Email de Cancelamento aos participantes
                      // ... (lógica de email de cancelamento como antes) ...
                 } catch(cancelError) { console.error(`[CRON] Erro CANCELAR ${caravanaId}:`, cancelError); }
            }
        }
        console.log('[CRON] Finalização automática concluída.');

    } catch (error) {
        console.error('[CRON] Erro GERAL finalização:', error);
    }
};











// Agenda as tarefas Cron

cron.schedule('0 0 * * *', enviarLembretes, { scheduled: true, timezone: "America/Sao_Paulo" }); // 8 da manhã
cron.schedule('0 0 * * *', confirmarOuCancelarPosVendas, { scheduled: true, timezone: "America/Sao_Paulo" });
cron.schedule('0 0 * * *', finalizarTransporteAutomaticamente, { scheduled: true, timezone: "America/Sao_Paulo"});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}`);
});