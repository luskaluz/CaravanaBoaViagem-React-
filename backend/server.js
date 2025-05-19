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
    console.log(`[Distr ${caravanaId}] Iniciando distribuição para ${transportesDefinidos.length} veículos.`);
    if (!transportesDefinidos || transportesDefinidos.length === 0) {
        return [];
    }

    const participantesSnapshot = await db.collection("participantes")
                                          .where("caravanaId", "==", caravanaId)
                                          .orderBy("timestamp", "asc")
                                          .get();

    const ingressosIndividuais = [];
    participantesSnapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        const qtd = data.quantidade || 1;
        for (let i = 0; i < qtd; i++) {
            ingressosIndividuais.push({ participanteDocId: id, indiceIngresso: i + 1 });
        }
    });
    console.log(`[Distr ${caravanaId}] Total de ${ingressosIndividuais.length} ingressos individuais a distribuir.`);

    const veiculosComContagem = transportesDefinidos.map(v => ({
        tipoId: v.tipoId,
        nomeTipo: v.nomeTipo,
        assentos: v.assentos,
        placa: v.placa,
        motoristaUid: v.motoristaUid,
        administradorUid: v.administradorUid,
        participantesAtribuidos: [],
        _vagasOcupadasTemp: 0
    }));

    let ingressoAtualIndex = 0;
    for (const veiculo of veiculosComContagem) {
        const assentosDisponiveisVeiculo = veiculo.assentos || 0;
        const participantesNesteVeiculoMap = new Map();

        console.log(`[Distr ${caravanaId}] Processando Veículo ${veiculo.nomeTipo}. Assentos: ${assentosDisponiveisVeiculo}`);

        while (veiculo._vagasOcupadasTemp < assentosDisponiveisVeiculo && ingressoAtualIndex < ingressosIndividuais.length) {
            const ingressoAtual = ingressosIndividuais[ingressoAtualIndex];
            participantesNesteVeiculoMap.set(
                ingressoAtual.participanteDocId,
                (participantesNesteVeiculoMap.get(ingressoAtual.participanteDocId) || 0) + 1
            );
            veiculo._vagasOcupadasTemp++;
            ingressoAtualIndex++;
        }

        for (const [docId, qtd] of participantesNesteVeiculoMap.entries()) {
            veiculo.participantesAtribuidos.push({ participanteDocId: docId, quantidadeAtribuida: qtd });
        }
        console.log(`[Distr ${caravanaId}] Veículo ${veiculo.nomeTipo} finalizado com ${veiculo._vagasOcupadasTemp} pessoas. ${veiculo.participantesAtribuidos.length} registros de participantes distintos.`);
    }

    if (ingressoAtualIndex < ingressosIndividuais.length) {
        console.error(`[Distr ${caravanaId}] ALERTA: Sobraram ${ingressosIndividuais.length - ingressoAtualIndex} ingressos não atribuídos!`);
    }

    return veiculosComContagem.map(({ _vagasOcupadasTemp, ...resto }) => resto);
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
    const despesas = parseFloat(caravana.despesas) || 0;

    // --- Determina a Capacidade Total e Vagas Ocupadas Corretas ---
    const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;
    const capacidadeTotalReal = transporteDefinido
                              ? (caravana.capacidadeFinalizada || 0)
                              : (caravana.capacidadeMaximaTeorica || 0);

    const vagasOcupadasClientes = caravana.vagasOcupadas || 0; // Vagas ocupadas por clientes

    // --- Cálculo de Métricas ---
    let receitaMaxima = 0;
    let lucroMaximo = 0;
    let roi = 0;
    let numAdminsConsiderados = 0; // Para calcular vagas reais de clientes na capacidade máxima

    if (capacidadeTotalReal > 0) {
        // Calcula quantos admins ocupariam espaço na capacidade máxima
        if (transporteDefinido && Array.isArray(caravana.transportesFinalizados)) {
            numAdminsConsiderados = Math.min(capacidadeTotalReal, caravana.transportesFinalizados.length);
        } else {
            numAdminsConsiderados = Math.min(capacidadeTotalReal, caravana.maximoTransportes || 0);
        }

        // Vagas máximas que poderiam ser vendidas para clientes
        const vagasMaxClientes = Math.max(0, capacidadeTotalReal - numAdminsConsiderados);

        receitaMaxima = preco * vagasMaxClientes; // Receita se todas as vagas de CLIENTES fossem vendidas
        lucroMaximo = receitaMaxima - despesas;
        roi = despesas > 0 && lucroMaximo > -Infinity ? (lucroMaximo / despesas) * 100 : (lucroMaximo > 0 ? Infinity : 0);
    } else {
        // Se capacidade não definida, métricas de máximo são 0 ou indefinidas
         lucroMaximo = -despesas; // Prejuízo das despesas
         roi = despesas > 0 ? -100 : 0; // ROI de -100% ou 0
    }


    const receitaAtual = vagasOcupadasClientes * preco; // Receita baseada nos clientes atuais
    const lucroAtual = receitaAtual - despesas;
    const roiAtual = despesas > 0 && lucroAtual > -Infinity ? (lucroAtual / despesas) * 100 : (lucroAtual > 0 ? Infinity : 0);

    return {
        // Métricas baseadas na capacidade MÁXIMA de clientes
        roi: roi,
        lucroMaximo: lucroMaximo, // Lucro se vender todas as vagas de clientes
        capacidadeTotalClientes: Math.max(0, capacidadeTotalReal - numAdminsConsiderados), // Capacidade real para clientes

        // Métricas baseadas na ocupação ATUAL de clientes
        roiAtual: roiAtual,
        lucroAtual: lucroAtual,
        vagasOcupadasClientes: vagasOcupadasClientes, // Renomeado para clareza

        // Mantém a capacidade total real (incluindo admins) para referência
        capacidadeTotalBruta: capacidadeTotalReal
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

// // Envia emails de forma assíncrona após a compra de ingresso ser confirmada no DB
// async function enviarEmailsPosCompra(usuarioEmail, quantidade, caravanaId, caravanaData, nomeLocalidade) {
//     try {
//         const emailCompraSubject = `Confirmação de Compra - Caravana para ${nomeLocalidade}`;
//         const emailCompraHtml = `
//             <p>Olá!</p>
//             <p>Sua compra de ${quantidade} ingresso(s) para a caravana com destino a ${nomeLocalidade} na data ${formatDate(caravanaData.data)} foi realizada com sucesso!</p>
//             <p>Detalhes:</p>
//             <ul>
//                 <li>Localidade: ${nomeLocalidade}</li>
//                 <li>Data: ${formatDate(caravanaData.data)}</li>
//                 <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>
//                 ${caravanaData.status === 'confirmada' ? '<li><b>Status:</b> Caravana Confirmada!</li>' : ''}
//             </ul>
//             <p>Agradecemos a preferência!</p>
//         `;
//         await sendEmail(usuarioEmail, emailCompraSubject, emailCompraHtml);

//         if (caravanaData.status === 'confirmada') {
//             const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
//             if (participantesNotificar.length > 0) {
//                 const emailConfirmacaoSubject = `Caravana para ${nomeLocalidade} Confirmada!`;
//                 const emailConfirmacaoHtml = `
//                     <p>Olá!</p>
//                     <p>A caravana para ${nomeLocalidade} na data ${formatDate(caravanaData.data)} foi confirmada!</p>
//                     <p>Detalhes:</p>
//                     <ul>
//                         <li>Localidade: ${nomeLocalidade}</li>
//                         <li>Data: ${formatDate(caravanaData.data)}</li>
//                         <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>
//                     </ul>
//                 `;
//                 for (const participante of participantesNotificar) {
//                     if (participante.email !== usuarioEmail) {
//                         await sendEmail(participante.email, emailConfirmacaoSubject, emailConfirmacaoHtml);
//                     }
//                 }
//             }
//         }
//     } catch (emailError) {
//         console.error(`Falha ao enviar e-mail(s) após compra para caravana ${caravanaId}:`, emailError);
//     }
// }

// async function alocarTransporte(pessoas, transportesDisponiveis) {
//     if (pessoas <= 0) return { alocacao: [], custoTotal: 0 };
//     if (!transportesDisponiveis || transportesDisponiveis.length === 0) return null; // Impossível sem transportes

//     // 1. Calcula custo por assento e ordena do mais barato para o mais caro por assento
//     const transportesOrdenados = transportesDisponiveis
//         .map(t => ({ ...t, custoPorAssento: t.assentos > 0 ? t.custoAluguel / t.assentos : Infinity }))
//         .sort((a, b) => a.custoPorAssento - b.custoPorAssento);

//     let pessoasRestantes = pessoas;
//     const alocacaoFinal = [];
//     let custoTotal = 0;
//     const disponibilidadeTemp = new Map(transportesOrdenados.map(t => [t.id, t.quantidadeDisponivel]));

//     // 2. Algoritmo Guloso Principal (preencher com os mais eficientes)
//     for (const transporte of transportesOrdenados) {
//         if (pessoasRestantes <= 0) break;
//         if (transporte.assentos <= 0) continue; // Ignora transporte sem assentos

//         const disponivel = disponibilidadeTemp.get(transporte.id) || 0;
//         if (disponivel <= 0) continue; // Pula se não houver mais deste tipo

//         // Quantos deste tipo precisamos/podemos usar?
//         const maxNecessarios = Math.ceil(pessoasRestantes / transporte.assentos);
//         const usar = Math.min(maxNecessarios, disponivel); // Usa o mínimo entre o necessário e o disponível

//         alocacaoFinal.push({
//             transporteId: transporte.id,
//             nome: transporte.nome,
//             assentos: transporte.assentos,
//             quantidadeUsada: usar
//         });
//         custoTotal += usar * transporte.custoAluguel;
//         pessoasRestantes -= usar * transporte.assentos;
//         disponibilidadeTemp.set(transporte.id, disponivel - usar); // Atualiza disponibilidade temporária
//     }

//     if (pessoasRestantes > 0) {
//         console.warn(`Alocação falhou: Faltaram ${pessoasRestantes} assentos.`);
//         return null; // Não foi possível alocar todos
//     }

//     return { alocacao: alocacaoFinal, custoTotal };
// }



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

app.post('/funcionarios', verificarAutenticacao, async (req, res) => {
    try {
        // Removido 'salario' da desestruturação e validação
        const { nome, email, telefone, senha, cargo, fotoUrl } = req.body;

        // Validação sem Salário
        if (!nome || !email || !telefone || !senha || !cargo) {
            return res.status(400).json({ error: "Campos nome, email, telefone, senha e cargo são obrigatórios." });
        }
        if (!['motorista', 'administrador', 'guia'].includes(cargo)) return res.status(400).json({ error: "Cargo inválido." });
        if (senha.length < 6) return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Formato de email inválido." });
        const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(telefone)) return res.status(400).json({ error: "Formato de telefone inválido." });
        // Remoção da validação de Salário

        const userRecord = await admin.auth().createUser({
            email: email, password: senha, displayName: nome,
        });

        // Objeto Firestore sem Salário
        const novoFuncionarioFirestore = {
            nome, email, telefone, cargo, fotoUrl: fotoUrl || null,
            // salario: salarioNum, // Removido
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
        res.status(500).json({ error: 'Erro interno ao criar funcionário.', details: error.message });
    }
});

// Rota PUT /funcionarios/:id (Sem Salário)
app.put('/funcionarios/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Removido 'salario' da desestruturação
        const { nome, email, telefone, cargo, fotoUrl } = req.body;

        const funcionarioRef = db.collection('funcionarios').doc(id);
        const funcDoc = await funcionarioRef.get();

        if (!funcDoc.exists) return res.status(404).json({ error: 'Funcionário não encontrado.' });
        const dadosAtuais = funcDoc.data();
        const funcionarioAtualizado = {};

        if (nome !== undefined) funcionarioAtualizado.nome = nome;
        if (email !== undefined) {
             // Validar email se mudar? Geralmente não se muda email de login facilmente.
             // Se permitir, precisa garantir unicidade e atualizar no Auth.
             // Por segurança, vamos impedir a mudança de email aqui por enquanto.
             // Se precisar mudar, é melhor ter um processo específico.
             if (email !== dadosAtuais.email) {
                 console.warn(`Tentativa de alterar email do funcionário ${id} para ${email}. Mudança de email não implementada/permitida nesta rota.`);
                 // return res.status(400).json({ error: "Não é permitido alterar o email por esta rota." });
             }
             // funcionarioAtualizado.email = email; // Comentado - não permite mudar email
        }
        if (telefone !== undefined) {
            const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
            if (!phoneRegex.test(telefone)) return res.status(400).json({ error: "Formato de telefone inválido." });
            funcionarioAtualizado.telefone = telefone;
        }
        if (cargo !== undefined) {
            if (!['motorista', 'administrador', 'guia'].includes(cargo)) return res.status(400).json({ error: "Cargo inválido." });
            funcionarioAtualizado.cargo = cargo;
        }
        // Remoção da lógica de Salário
        if (fotoUrl !== undefined) funcionarioAtualizado.fotoUrl = fotoUrl; // Permite null para remover

        // Verifica se houve alguma alteração real
        let hasChanges = false;
        for(const key in funcionarioAtualizado) {
             if(funcionarioAtualizado[key] !== dadosAtuais[key]) {
                 hasChanges = true;
                 break;
             }
        }

        if (!hasChanges) {
             // Nenhuma mudança detectada, mas podemos apenas atualizar o timestamp ou retornar 304/200
            await funcionarioRef.update({ lastUpdate: admin.firestore.FieldValue.serverTimestamp() });
            const currentDoc = await funcionarioRef.get(); // Pega os dados atuais para retornar
             return res.status(200).json({ message: 'Nenhuma alteração detectada, timestamp atualizado.', data: currentDoc.data() });
             // return res.status(304).send(); // Alternativa: Not Modified
        }


        funcionarioAtualizado.lastUpdate = admin.firestore.FieldValue.serverTimestamp();
        await funcionarioRef.update(funcionarioAtualizado);

        // Atualiza Auth (apenas displayName se o nome mudou)
        try {
             const authUpdates = {};
             if (funcionarioAtualizado.nome && funcionarioAtualizado.nome !== dadosAtuais.nome) {
                  authUpdates.displayName = funcionarioAtualizado.nome;
             }
             // Se permitir mudança de email, descomentar:
             // if (funcionarioAtualizado.email && funcionarioAtualizado.email !== dadosAtuais.email) {
             //     authUpdates.email = funcionarioAtualizado.email;
             // }
             // Se quiser atualizar foto no Auth também:
             // if (funcionarioAtualizado.fotoUrl !== undefined && funcionarioAtualizado.fotoUrl !== dadosAtuais.fotoUrl) {
             //     authUpdates.photoURL = funcionarioAtualizado.fotoUrl;
             // }

             if (Object.keys(authUpdates).length > 0) {
                 await admin.auth().updateUser(id, authUpdates);
             }
        } catch (authError) {
             console.error("Erro ao atualizar dados no Firebase Auth:", authError);
             // Retorna sucesso parcial
             const updatedDocPartial = await funcionarioRef.get();
             return res.status(200).json({
                 message: 'Funcionário atualizado no BD, mas erro ao atualizar Auth.',
                 details: authError.message,
                 data: updatedDocPartial.data()
                });
        }

        const updatedDoc = await funcionarioRef.get();
        res.status(200).json({ message: 'Funcionário atualizado com sucesso.', data: updatedDoc.data() });

    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar funcionário.', details: error.message });
    }
});


app.get('/funcionarios', verificarAutenticacao, async (req, res) => {
    // ... sua lógica para buscar e retornar nome, cargo, fotoUrl ...
    // IMPORTANTE: NÃO retorne dados sensíveis como email, telefone, salário aqui
    // se for para ser acessado por qualquer usuário.
    try {
        const snapshot = await db.collection('funcionarios').orderBy('nome').get();
        const funcionarios = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            funcionarios.push({
                id: doc.id,
                uid: data.uid,
                nome: data.nome,
                cargo: data.cargo,
                fotoUrl: data.fotoUrl || null, // Garante que envia fotoUrl
                ...data
            });
        });
        res.status(200).json(funcionarios);
    } catch (error) {
        console.error("Erro ao listar funcionários (rota pública autenticada):", error);
        res.status(500).json({ error: "Erro interno ao listar equipe." });
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
    const { uid: funcionarioUid } = req.params;
    const loggedInUserUid = req.user.uid;

    // Verificação de permissão: apenas o próprio funcionário ou um admin geral podem ver
    if (funcionarioUid !== loggedInUserUid && req.user.email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ error: "Acesso não autorizado para ver caravanas deste funcionário." });
    }

    console.log(`[FuncCaravanas] Buscando caravanas para funcionário UID: ${funcionarioUid}`);

    try {
        // Busca todas as caravanas que não estão canceladas ou concluídas
        // Você pode adicionar mais filtros aqui se necessário (ex: data futura)
        const todasCaravanasSnap = await db.collection('caravanas')
            .where('status', 'in', ['confirmada', 'nao_confirmada'])
            .get();

        if (todasCaravanasSnap.empty) {
            console.log("[FuncCaravanas] Nenhuma caravana ativa encontrada no sistema.");
            return res.status(200).json([]);
        }

        const caravanasDoFuncionario = [];

        // Itera sobre TODAS as caravanas ativas e filtra
        for (const doc of todasCaravanasSnap.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;
            let funcionarioEnvolvido = false;

            // 1. Verifica Guia
            if (caravana.guiaUid === funcionarioUid) {
                funcionarioEnvolvido = true;
            }

            // 2. Verifica Admin/Motorista em transportesFinalizados
            if (!funcionarioEnvolvido && Array.isArray(caravana.transportesFinalizados)) {
                for (const veiculo of caravana.transportesFinalizados) {
                    if (veiculo.administradorUid === funcionarioUid || veiculo.motoristaUid === funcionarioUid) {
                        funcionarioEnvolvido = true;
                        break; // Encontrou, não precisa checar mais veículos nesta caravana
                    }
                }
            }

            // 3. Fallback: Verifica Admin/Motorista no nível superior (se você ainda usa/migra dados antigos)
            if (!funcionarioEnvolvido && (caravana.administradorUid === funcionarioUid || caravana.motoristaUid === funcionarioUid)) {
                 funcionarioEnvolvido = true;
            }


            if (funcionarioEnvolvido) {
                // Se envolvido, busca dados adicionais para esta caravana
                console.log(`[FuncCaravanas] Funcionário ${funcionarioUid} envolvido na caravana ${caravanaId}. Buscando detalhes...`);
                const [localidadeData, adminGeralData, motoristaGeralData, guiaData] = await Promise.all([
                    getLocalidadeData(caravana.localidadeId),
                    getFuncionarioData(caravana.administradorUid), // Admin geral (pode ser diferente do admin do veículo)
                    getFuncionarioData(caravana.motoristaUid),   // Motorista geral (pode ser diferente)
                    getFuncionarioData(caravana.guiaUid)
                ]);

                // Para métricas, precisamos da capacidade correta
                const capacidadeParaMetricas = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido
                                          ? (caravana.capacidadeFinalizada || 0)
                                          : (caravana.capacidadeMaximaTeorica || 0);

                // Simplificando métricas ou removendo se não usadas nesta view
                const metricasSimples = {
                     vagasOcupadas: caravana.vagasOcupadas || 0,
                     capacidadeUsadaParaVenda: capacidadeParaMetricas
                };


                caravanasDoFuncionario.push({
                    id: caravanaId,
                    ...caravana,
                    ...localidadeData,
                    // Adiciona os dados dos funcionários gerais da caravana
                    administrador: adminGeralData,
                    motorista: motoristaGeralData,
                    guia: guiaData,
                    // Adiciona métricas simples se necessário
                    ...metricasSimples
                });
            }
        }

        if (caravanasDoFuncionario.length === 0) {
            console.log(`[FuncCaravanas] Nenhuma caravana encontrada para ${funcionarioUid} após filtro.`);
        } else {
            console.log(`[FuncCaravanas] ${caravanasDoFuncionario.length} caravana(s) encontrada(s) para ${funcionarioUid}.`);
        }

        // Ordena antes de enviar
        caravanasDoFuncionario.sort((a, b) => {
            const dataA = new Date(a.data + 'T00:00:00Z');
            const dataB = new Date(b.data + 'T00:00:00Z');
            return dataA - dataB; // Ex: Mais recentes primeiro se inverter a e b
        });

        res.status(200).json(caravanasDoFuncionario);

    } catch (error) {
        console.error(`[FuncCaravanas] Erro ao buscar caravanas para funcionário ${funcionarioUid}:`, error);
        res.status(500).json({ error: 'Erro interno ao buscar caravanas do funcionário.' });
    }
});





// ROTAS DE CARAVANAS
// post /caravana
app.post('/caravanas', verificarAutenticacao, verificarAdmin, async (req, res) => {
    try {
        const {
            localidadeId, data, horarioSaida, despesas, lucroAbsoluto, ocupacaoMinima, preco,
            maximoTransportes, guiaUid, dataConfirmacaoTransporte, dataFechamentoVendas,
            pontoEncontro, dataHoraRetorno
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
        const adminsTeoricos = maxTranspNum;

        if (capacidadeMaximaTeorica < (ocupacaoMinNum + adminsTeoricos)) {
            return res.status(400).json({ error: `Capacidade Máxima Teórica (${capacidadeMaximaTeorica}) insuficiente para Ocupação Mínima (${ocupacaoMinNum}) + ${adminsTeoricos} admin(s).` });
        }

        let dataHoraRetornoISO = null;
        if (dataHoraRetorno) {
            try {
                 const dtRetorno = new Date(dataHoraRetorno);
                 if (isNaN(dtRetorno.getTime())) throw new Error();
                 const dtViagemCheck = new Date(data + 'T00:00:00Z');
                 if (dtRetorno.getTime() <= dtViagemCheck.getTime()) throw new Error("Retorno antes da viagem");
                 dataHoraRetornoISO = dtRetorno.toISOString();
            } catch (e) {
                return res.status(400).json({ error: "Data/Hora de Retorno inválida ou anterior à viagem." });
            }
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
            pontoEncontro: pontoEncontro || null,
            dataHoraRetorno: dataHoraRetornoISO,
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
        // Retorna erro de validação específico ou erro genérico
        if (error.message.includes('inválido') || error.message.includes('insuficiente') || error.message.includes('posterior') || error.message.includes('não encontrada')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Erro interno ao criar caravana.", details: error.message });
        }
    }
});

// --- Rota PUT /caravanas/:id --- (Completo, Sem Comentários)
app.put('/caravanas/:id', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        localidadeId, data, horarioSaida, despesas, lucroAbsoluto, ocupacaoMinima, preco,
        maximoTransportes, guiaUid, dataConfirmacaoTransporte, dataFechamentoVendas,
        pontoEncontro, dataHoraRetorno
    } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();
        if (!caravanaDoc.exists) return res.status(404).json({ error: 'Caravana não encontrada.' });
        const caravanaAtual = caravanaDoc.data();

        if (!localidadeId || !data || !despesas || !lucroAbsoluto || !ocupacaoMinima || preco === undefined || preco === null || preco === '' || !maximoTransportes || !dataConfirmacaoTransporte) {
             return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }
        const precoNum = parseFloat(preco);
        const maxTranspNum = parseInt(maximoTransportes, 10);
        const ocupacaoMinNum = parseInt(ocupacaoMinima, 10);
        const despesasNum = parseFloat(despesas) || 0;
        const lucroNum = parseFloat(lucroAbsoluto) || 0;
        if (isNaN(precoNum) || precoNum < 0) return res.status(400).json({ error: "Preço inválido." });
        if (isNaN(maxTranspNum) || maxTranspNum <= 0) return res.status(400).json({ error: "Nº Máx. Transportes inválido." });
        if (isNaN(ocupacaoMinNum) || ocupacaoMinNum <= 0) return res.status(400).json({ error: "Ocupação Mínima inválida." });

        let dataHoraRetornoISO = null;
        if (dataHoraRetorno) {
             try {
                 const dtRetorno = new Date(dataHoraRetorno);
                 if (isNaN(dtRetorno.getTime())) throw new Error();
                 const dtViagemCheck = new Date(data + 'T00:00:00Z');
                 if (dtRetorno.getTime() <= dtViagemCheck.getTime()) throw new Error("Retorno antes da viagem");
                 dataHoraRetornoISO = dtRetorno.toISOString();
             } catch (e) {
                 return res.status(400).json({ error: "Data/Hora de Retorno inválida ou anterior à viagem." });
             }
        }

        const maxAssentosPorVeiculo = await getMaxAssentosTransporte();
        if (maxAssentosPorVeiculo <= 0) return res.status(400).json({ error: "Nenhum tipo de transporte válido." });
        const novaCapacidadeMaximaTeorica = maxAssentosPorVeiculo * maxTranspNum;
        const novosAdminsTeoricos = maxTranspNum;
        const vagasOcupadasAtuais = caravanaAtual.vagasOcupadas || 0;

        if (novaCapacidadeMaximaTeorica < (ocupacaoMinNum + novosAdminsTeoricos)) {
            return res.status(400).json({ error: `Nova Capacidade Teórica (${novaCapacidadeMaximaTeorica}) insuficiente p/ Ocup. Mín. (${ocupacaoMinNum}) + ${novosAdminsTeoricos} admin(s).` });
        }

        const capacidadeAtualParaVenda = caravanaAtual.transporteDefinidoManualmente ? (caravanaAtual.capacidadeFinalizada || 0) : (caravanaAtual.transporteAutoDefinido ? (caravanaAtual.capacidadeFinalizada || 0) : (caravanaAtual.capacidadeMaximaTeorica || 0));
        let numAdminsAtuais = 0;
         if ((caravanaAtual.transporteDefinidoManualmente || caravanaAtual.transporteAutoDefinido) && Array.isArray(caravanaAtual.transportesFinalizados)) {
             numAdminsAtuais = Math.min(capacidadeAtualParaVenda, caravanaAtual.transportesFinalizados.length);
         } else if(capacidadeAtualParaVenda > 0) {
             numAdminsAtuais = Math.min(capacidadeAtualParaVenda, caravanaAtual.maximoTransportes || 0);
         }
        if (novaCapacidadeMaximaTeorica < (vagasOcupadasAtuais + numAdminsAtuais)) {
             return res.status(400).json({ error: `Não é possível definir Nº Máx. Transp. p/ ${maxTranspNum} (Cap Teórica ${novaCapacidadeMaximaTeorica}), pois ${vagasOcupadasAtuais} clientes + ${numAdminsAtuais} admin(s) já ocupam vagas.` });
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

        if (localidadeId && localidadeId !== caravanaAtual.localidadeId) {
             const locCheck = await db.collection('localidades').doc(localidadeId).get();
             if (!locCheck.exists) return res.status(404).json({ error: 'Nova localidade não encontrada.' });
        }

        const tiposSnapshot = await db.collection('transportes').get();
        const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Usa numAdminsAtuais (baseado na capacidade de venda ATUAL) para calcular a nova alocação ideal
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
            pontoEncontro: pontoEncontro || null,
            dataHoraRetorno: dataHoraRetornoISO,
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
        if (error.message.includes('inválido') || error.message.includes('insuficiente') || error.message.includes('posterior') || error.message.includes('não encontrada')) {
             res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Erro interno ao atualizar caravana.", details: error.message });
        }
    }
});


// server.js (Apenas a rota PUT /caravanas/:id/confirmar-manual Modificada)

app.put('/caravanas/:id/confirmar-manual', verificarAutenticacao, verificarAdmin, async (req, res) => {
    const { id: caravanaId } = req.params;
    let dadosCaravanaParaEmail = null; // Para usar no email após a transação

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);

        const statusUpdateResult = await db.runTransaction(async (transaction) => {
            const caravanaDoc = await transaction.get(caravanaRef);
            if (!caravanaDoc.exists) {
                throw new Error("Caravana não encontrada.");
            }
            const caravana = caravanaDoc.data();
            dadosCaravanaParaEmail = { ...caravana, id: caravanaId }; // Captura estado para email

            if (caravana.status === 'confirmada') {
                // Retorna um objeto indicando que já estava confirmada
                return { jaConfirmada: true, message: "Esta caravana já está confirmada." };
            }
            if (caravana.status === 'cancelada' || caravana.status === 'concluida') {
                throw new Error(`Não é possível confirmar uma caravana com status '${caravana.status}'.`);
            }

            const ocupacaoMinima = caravana.ocupacaoMinima || 0;
            const vagasOcupadasClientes = caravana.vagasOcupadas || 0;
            console.log(`[ConfirmarManual ${caravanaId}] Vagas Clientes: ${vagasOcupadasClientes}, Mínimo: ${ocupacaoMinima}`);
            if (vagasOcupadasClientes < ocupacaoMinima) {
                throw new Error(`Ocupação mínima de clientes (${ocupacaoMinima}) não atingida. Atualmente com ${vagasOcupadasClientes} clientes.`);
            }

            // Verifica se o transporte foi DEFINIDO (manual ou auto) E se todos os detalhes estão completos
            const transporteDefinidoECompleto =
                (caravana.transporteDefinidoManualmente === true || caravana.transporteAutoDefinido === true) &&
                Array.isArray(caravana.transportesFinalizados) &&
                caravana.transportesFinalizados.length > 0 &&
                caravana.transportesFinalizados.every(v => v.placa && v.motoristaUid && v.administradorUid);

            console.log(`[ConfirmarManual ${caravanaId}] Transporte Definido e Completo: ${transporteDefinidoECompleto}`);
            if (!transporteDefinidoECompleto) {
                throw new Error("Para confirmar manualmente, o transporte deve estar completamente definido: Todos os veículos devem ter tipo, placa, motorista e administrador atribuídos.");
            }

            // Se passou em todas as validações, prepara para confirmar
            const updateData = {
                status: 'confirmada',
                confirmadaEm: admin.firestore.FieldValue.serverTimestamp(),
                motivoCancelamento: null, // Limpa motivo de cancelamento se houver
                // Não vamos alterar dataFechamentoVendas aqui, a menos que seja uma regra específica
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            };

            transaction.update(caravanaRef, updateData);
            console.log(`[ConfirmarManual ${caravanaId}] Transação: Caravana marcada como confirmada.`);
            return { sucesso: true, message: "Caravana confirmada manualmente com sucesso!" };
        });

        if (statusUpdateResult.jaConfirmada) {
            return res.status(200).json({ message: statusUpdateResult.message }); // Retorna 200 se já estava confirmada
        }

        // Envio de Email aos Participantes (APÓS a transação bem-sucedida)
        if (statusUpdateResult.sucesso && dadosCaravanaParaEmail) {
            try {
                // Pega os dados MAIS RECENTES da caravana para o email, especialmente transportesFinalizados
                const caravanaAtualizadaDoc = await caravanaRef.get();
                if (!caravanaAtualizadaDoc.exists) throw new Error("Caravana não encontrada após confirmação.");
                const caravanaFinalParaEmail = caravanaAtualizadaDoc.data();

                const participantes = await buscarParticipantesParaNotificacao(caravanaId);
                if (participantes.length > 0) {
                    const localidadeInfo = await getLocalidadeData(caravanaFinalParaEmail.localidadeId);
                    const nomeLocalidade = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';
                    const dataFormatadaEmail = await formatDate(caravanaFinalParaEmail.data); // Usa await se formatDate for async
                    const pontoEncontroEmail = caravanaFinalParaEmail.pontoEncontro || 'A definir';
                    const horarioSaidaEmail = caravanaFinalParaEmail.horarioSaida || 'A definir';
                    const dataHoraRetornoFormatada = caravanaFinalParaEmail.dataHoraRetorno
                        ? await formatDate(caravanaFinalParaEmail.dataHoraRetorno, true, 'America/Sao_Paulo') // Passa true para incluir hora
                        : 'A definir';

                    const emailSubject = `Caravana Confirmada! - ${nomeLocalidade} (${dataFormatadaEmail})`;
                    console.log(`[ConfirmarManual ${caravanaId}] Preparando ${participantes.length} emails de confirmação...`);

                    for (const p of participantes) {
                        const participanteDocSnapshot = await db.collection('participantes').where('caravanaId', '==', caravanaId).where('email', '==', p.email).limit(1).get();
                        let veiculoAtribuidoInfo = "Seu veículo específico será detalhado pela equipe.";
                        let nomeParticipanteParaEmail = p.nome || 'Viajante';

                        if (!participanteDocSnapshot.empty && Array.isArray(caravanaFinalParaEmail.transportesFinalizados)) {
                             const participanteDocId = participanteDocSnapshot.docs[0].id;
                             const participanteData = participanteDocSnapshot.docs[0].data();
                             nomeParticipanteParaEmail = participanteData.nome || nomeParticipanteParaEmail;

                             let indiceVeiculo = -1;
                             let veiculoEncontrado = null;
                             for(let i = 0; i < caravanaFinalParaEmail.transportesFinalizados.length; i++) {
                                 if(caravanaFinalParaEmail.transportesFinalizados[i].participantesAtribuidos?.find(pa => pa.participanteDocId === participanteDocId)) {
                                     veiculoEncontrado = caravanaFinalParaEmail.transportesFinalizados[i];
                                     indiceVeiculo = i + 1;
                                     break;
                                 }
                             }
                             if (veiculoEncontrado) {
                                 veiculoAtribuidoInfo = `Transporte ${indiceVeiculo}: ${veiculoEncontrado.nomeTipo || 'Tipo não informado'}`;
                                 if (veiculoEncontrado.placa) veiculoAtribuidoInfo += ` (Placa: ${veiculoEncontrado.placa})`;
                                 veiculoAtribuidoInfo += ".";
                             } else {
                                 console.warn(`[ConfirmarManual ${caravanaId}] Part. ${participanteDocId} não encontrado em transportesFinalizados.`);
                             }
                        }

                        const emailHtml = `
                            <p>Olá ${nomeParticipanteParaEmail}!</p>
                            <p>Ótima notícia! A caravana para <strong>${nomeLocalidade}</strong> na data <strong>${dataFormatadaEmail}</strong> foi confirmada!</p>
                            <p>Você foi alocado(a) no: ${veiculoAtribuidoInfo}</p>
                            <p>Ponto de Encontro: ${pontoEncontroEmail}</p>
                            <p>Horário de Saída Previsto: ${horarioSaidaEmail}</p>
                            <p>Retorno Estimado: ${dataHoraRetornoFormatada}</p>
                            <p>Prepare-se para a viagem! Mais detalhes e lembretes serão enviados.</p>
                            <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                        `;
                        await sendEmail(p.email, emailSubject, emailHtml);
                    }
                    console.log(`[ConfirmarManual ${caravanaId}] Emails de confirmação manual enviados.`);
                }
            } catch (emailError) {
                console.error(`[ConfirmarManual ${caravanaId}] Erro ao enviar emails de confirmação:`, emailError);
            }
        }

        res.status(200).json({ message: statusUpdateResult.message });

    } catch (error) {
        console.error(`Erro ao confirmar caravana ${caravanaId} manualmente:`, error);
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        const statusCode = errorMessage.includes('não encontrada') || errorMessage.includes('inválido') || errorMessage.includes('insuficiente') || errorMessage.includes('atingida') || errorMessage.includes('Não é possível confirmar') ? 400 : 500;
        res.status(statusCode).json({ error: errorMessage, ...(statusCode === 500 && { details: error.toString() }) });
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
              <p>Informamos que a caravana para ${nomeLocalidade} marcada para ${formatDate(caravana.data)} foi cancelada.</p>
              ${motivo ? `<p>Motivo: ${motivo}</p>` : ''}
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
    const { funcionarioUid, cargo } = req.query;
    const isAdminView = !funcionarioUid;

    console.log(`[PD GET ${caravanaId}] Iniciando. Funcionario UID: ${funcionarioUid}, Cargo: ${cargo}`);

    try {
        const caravanaDoc = await db.collection('caravanas').doc(caravanaId).get();
        if (!caravanaDoc.exists) {
            console.log(`[PD GET ${caravanaId}] Caravana não encontrada.`);
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        const caravana = caravanaDoc.data();
        console.log(`[PD GET ${caravanaId}] Caravana encontrada. Status: ${caravana.status}`);

        const transporteDefinido = (caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) &&
                                 caravana.transportesFinalizados &&
                                 caravana.transportesFinalizados.length > 0;

        if (!transporteDefinido) {
            console.log(`[PD GET ${caravanaId}] Transporte não definido. Retornando lista geral.`);
             const participantesSnapshot = await db.collection('participantes')
                 .where('caravanaId', '==', caravanaId)
                 .orderBy('timestamp', 'desc')
                 .get();
             const todosParticipantes = await Promise.all(participantesSnapshot.docs.map(async doc => {
                 const pData = doc.data();
                 let nomeParticipante = pData.nome || 'Nome não informado';
                 let telefoneParticipante = null;
                 if (pData.uid) {
                     try {
                         const userDoc = await db.collection('users').doc(pData.uid).get();
                         if (userDoc.exists) {
                             nomeParticipante = userDoc.data().nome || nomeParticipante;
                             telefoneParticipante = userDoc.data().telefone || null;
                         }
                     } catch (userFetchError) {
                         console.error(`[PD GET ${caravanaId}] Erro ao buscar usuário ${pData.uid}:`, userFetchError);
                     }
                 }
                 return { id: doc.id, ...pData, nome: nomeParticipante, telefone: telefoneParticipante, quantidade: pData.quantidade || 0 };
             }));
            return res.status(200).json({ definicaoCompleta: false, todosParticipantes: todosParticipantes });
        }

        console.log(`[PD GET ${caravanaId}] Transporte definido. Processando ${caravana.transportesFinalizados.length} veículos...`);
        const participantesCache = new Map();
        const funcionariosCache = new Map();

        let veiculosParaProcessar = [...caravana.transportesFinalizados];

        if (!isAdminView && cargo && cargo !== 'guia') {
            console.log(`[PD GET ${caravanaId}] Filtrando para funcionário ${funcionarioUid} (${cargo})`);
            veiculosParaProcessar = caravana.transportesFinalizados.filter(veiculo =>
                (cargo === 'administrador' && veiculo.administradorUid === funcionarioUid) ||
                (cargo === 'motorista' && veiculo.motoristaUid === funcionarioUid)
            );
            if (veiculosParaProcessar.length === 0) {
                console.log(`[PD GET ${caravanaId}] Nenhum veículo para este funcionário.`);
                return res.status(200).json({ definicaoCompleta: true, veiculosComParticipantes: [] });
            }
        }
        console.log(`[PD GET ${caravanaId}] Número de veículos para processar após filtro: ${veiculosParaProcessar.length}`);

        const veiculosComParticipantesDetalhados = await Promise.all(
            veiculosParaProcessar.map(async (veiculo, veiculoIndex) => {
                console.log(`[PD GET ${caravanaId}] Veículo ${veiculoIndex + 1}: Tipo ID ${veiculo.tipoId}, Admin UID ${veiculo.administradorUid}, Motorista UID ${veiculo.motoristaUid}`);
                const participantesAtribuidosDetalhes = [];
                let totalPessoasNoVeiculo = 0;

                if (veiculo.participantesAtribuidos && Array.isArray(veiculo.participantesAtribuidos)) {
                    console.log(`[PD GET ${caravanaId}] Veículo ${veiculoIndex + 1}: Tem ${veiculo.participantesAtribuidos.length} objetos de atribuição.`);

                    for (const atribuicao of veiculo.participantesAtribuidos) {
                        const participanteDocId = atribuicao.participanteDocId;
                        const quantidadeNesteVeiculo = atribuicao.quantidadeAtribuida || 0; // Quantos ingressos *desta compra* estão neste veículo

                        if (!participanteDocId || quantidadeNesteVeiculo <= 0) {
                            console.warn(`[PD GET ${caravanaId}] Atribuição inválida encontrada no veículo ${veiculoIndex + 1}:`, atribuicao);
                            continue;
                        }

                        totalPessoasNoVeiculo += quantidadeNesteVeiculo;

                        let dadosCompletosParticipante = participantesCache.get(participanteDocId);
                        if (!dadosCompletosParticipante) {
                            try {
                                const pDoc = await db.collection('participantes').doc(participanteDocId).get();
                                if (pDoc.exists) {
                                    dadosCompletosParticipante = { id: pDoc.id, ...pDoc.data() };
                                    let nomeP = dadosCompletosParticipante.nome || 'Nome não informado';
                                    let telP = null;
                                    if (dadosCompletosParticipante.uid) {
                                        const userDoc = await db.collection('users').doc(dadosCompletosParticipante.uid).get();
                                        if (userDoc.exists) {
                                            nomeP = userDoc.data().nome || nomeP;
                                            telP = userDoc.data().telefone || null;
                                        }
                                    }
                                    dadosCompletosParticipante.nome = nomeP;
                                    dadosCompletosParticipante.telefone = telP;
                                    // Não sobrescreve a 'quantidade' original aqui, vamos adicionar a específica do veículo
                                    participantesCache.set(participanteDocId, dadosCompletosParticipante);
                                } else {
                                    console.warn(`[PD GET ${caravanaId}] Documento participante ${participanteDocId} não encontrado.`);
                                     dadosCompletosParticipante = { id: participanteDocId, nome: `Participante ID ${participanteDocId} (Removido?)`, email:'N/A', telefone: 'N/A', quantidade: 0 };
                                }
                            } catch (pError) {
                                console.error(`[PD GET ${caravanaId}] Erro buscar participante ${participanteDocId}:`, pError);
                                dadosCompletosParticipante = { id: participanteDocId, nome: `Erro ao buscar ${participanteDocId}`, email:'N/A', telefone: 'N/A', quantidade: 0 };
                            }
                        }
                        // Adiciona o objeto do participante com a quantidade específica para ESTE VEÍCULO
                        participantesAtribuidosDetalhes.push({
                            ...dadosCompletosParticipante,
                            quantidade: quantidadeNesteVeiculo // <<< USA A QUANTIDADE ATRIBUÍDA AO VEÍCULO
                        });
                    }
                    participantesAtribuidosDetalhes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                }

                let adminData = null;
                if (veiculo.administradorUid) {
                    if (!funcionariosCache.has(veiculo.administradorUid)) {
                         funcionariosCache.set(veiculo.administradorUid, await getFuncionarioData(veiculo.administradorUid));
                    }
                    adminData = funcionariosCache.get(veiculo.administradorUid);
                }
                let motoristaData = null;
                if (veiculo.motoristaUid) {
                     if (!funcionariosCache.has(veiculo.motoristaUid)) {
                          funcionariosCache.set(veiculo.motoristaUid, await getFuncionarioData(veiculo.motoristaUid));
                     }
                     motoristaData = funcionariosCache.get(veiculo.motoristaUid);
                }

                console.log(`[PD GET ${caravanaId}] Veículo ${veiculoIndex + 1} processado. Total de pessoas (calculado dos atribuidos): ${totalPessoasNoVeiculo}`);
                return {
                    veiculoInfo: {
                        tipoId: veiculo.tipoId, nomeTipo: veiculo.nomeTipo,
                        assentos: veiculo.assentos, placa: veiculo.placa
                    },
                    administrador: adminData ? { uid: adminData.uid || adminData.id, nome: adminData.nome } : null,
                    motorista: motoristaData ? { uid: motoristaData.uid || motoristaData.id, nome: motoristaData.nome } : null,
                    participantesAtribuidos: participantesAtribuidosDetalhes, // Lista de participantes com sua 'quantidade' neste veículo
                    totalPessoasVeiculo: totalPessoasNoVeiculo // A soma das 'quantidade' dos participantes neste veículo
                };
            })
        );

        console.log(`[PD GET ${caravanaId}] Enviando resposta com veículos detalhados.`);
        res.status(200).json({
            definicaoCompleta: true,
            veiculosComParticipantes: veiculosComParticipantesDetalhados
        });

    } catch (error) {
        console.error(`[PD GET ${caravanaId}] ERRO GERAL:`, error);
        res.status(500).json({ error: "Erro interno ao buscar participantes distribuídos.", details: error.message });
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
            const caravanaAtualizadaDocAposCompra = await caravanaRef.get(); // Pega dados mais recentes
            const dadosCaravanaParaEmailUsuario = caravanaAtualizadaDocAposCompra.exists ? caravanaAtualizadaDocAposCompra.data() : caravanaDataParaEmail;

            const localidadeInfoCompra = await getLocalidadeData(dadosCaravanaParaEmailUsuario.localidadeId);
            const nomeLocalidadeFinalCompra = localidadeInfoCompra.nomeLocalidade || 'Destino Desconhecido';
            const dataFormatadaCompra = await formatDate(dadosCaravanaParaEmailUsuario.data);

            const emailCompraSubject = `Confirmação de Compra - Caravana para ${nomeLocalidadeFinalCompra}`;
            const emailCompraHtml = `
                <p>Olá ${usuarioNome || ''}!</p>
                <p>Sua compra de ${quantidadeNumerica} ingresso(s) para a caravana com destino a ${nomeLocalidadeFinalCompra} na data ${dataFormatadaCompra} foi realizada com sucesso!</p>
                <p>Horário de Saída Previsto: ${dadosCaravanaParaEmailUsuario.horarioSaida || 'A definir'}</p>
                <p>Ponto de Encontro: ${dadosCaravanaParaEmailUsuario.pontoEncontro || 'A definir (verifique próximo à data)'}</p>
                <p>Retorno Estimado: ${dadosCaravanaParaEmailUsuario.dataHoraRetorno ? (await formatDate(dadosCaravanaParaEmailUsuario.dataHoraRetorno)) + ' às ' + new Date(dadosCaravanaParaEmailUsuario.dataHoraRetorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'A definir'}</p>
                <p>Detalhes sobre o transporte e outras instruções serão enviados mais próximo à data da viagem, caso o transporte ainda não tenha sido definido.</p>
                <p>Agradecemos a preferência!</p>
                <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
            `;
            await sendEmail(usuarioEmail, emailCompraSubject, emailCompraHtml);
             console.log(`[${caravanaId}] Email de confirmação de compra enviado para ${usuarioEmail}.`);
        } catch (emailCompraError) {
            console.error(`[${caravanaId}] Falha ao enviar email de confirmação de compra para ${usuarioEmail}:`, emailCompraError);
        }

        // 2. Email para o Admin (se alocação ideal sugerida mudou)
        if (alocacaoAntes !== null && alocacaoDepois !== null && alocacoesDiferentes(alocacaoAntes, alocacaoDepois)) {
            console.log(`[${caravanaId}] Alocação ideal alterada. Enviando email para admin...`);
            try {
                 const caravanaAtualizadaDocAdminEmail = await caravanaRef.get(); // Pega dados mais recentes, incluindo capacidadeCalculada
                 const dadosCaravanaParaEmailAdmin = caravanaAtualizadaDocAdminEmail.exists ? caravanaAtualizadaDocAdminEmail.data() : caravanaDataParaEmail;

                 const localidadeInfoAdmin = await getLocalidadeData(dadosCaravanaParaEmailAdmin.localidadeId);
                 const nomeLocalidadeFinalAdmin = localidadeInfoAdmin.nomeLocalidade || 'Destino Desconhecido';
                 const dataFormatadaViagemAdmin = await formatDate(dadosCaravanaParaEmailAdmin.data);
                 const dataFormatadaConfAdmin = await formatDate(dadosCaravanaParaEmailAdmin.dataConfirmacaoTransporte);

                const formatarAlocacaoParaEmail = (aloc) => {
                    if (!aloc || aloc.length === 0) return "<li>Nenhuma sugestão anterior ou cálculo falhou.</li>";
                    return aloc.map(item => `<li>${item.quantidade}x ${item.nomeTipo} (${item.assentos} assentos)</li>`).join('');
                };

                const emailSubjectAdmin = `Alerta: Alocação Sugerida Alterada - ${nomeLocalidadeFinalAdmin} (${dataFormatadaViagemAdmin})`;
                const emailHtmlAdmin = `
                    <p>Olá Administrador,</p>
                    <p>A alocação de transporte ideal sugerida para a caravana ${nomeLocalidadeFinalAdmin} (Data: ${dataFormatadaViagemAdmin}) foi recalculada devido a uma nova compra.</p>
                    <p>Data final para definição: ${dataFormatadaConfAdmin}.</p>
                    <hr>
                    <p>Alocação Anterior Sugerida:</p>
                    <ul>${formatarAlocacaoParaEmail(alocacaoAntes)}</ul>
                    <hr>
                    <p>Nova Alocação Sugerida:</p>
                    <ul>
                        ${formatarAlocacaoParaEmail(alocacaoDepois)}
                        <li>Capacidade Total Sugerida: ${dadosCaravanaParaEmailAdmin.capacidadeCalculada || 'N/A'}</li>
                    </ul>
                    <hr>
                    <p>Verifique e defina o transporte manualmente se necessário antes da data limite.</p>
                    <p>Atenciosamente,<br/>Sistema Caravana da Boa Viagem</p>
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
        if (transportesSalvosComAtribuicao) {
            try {
                // Busca dados da caravana atualizados após a transação para usar no email
                const caravanaAtualizadaDocEmail = await caravanaRef.get();
                const caravanaFinalDataEmail = caravanaAtualizadaDocEmail.exists ? caravanaAtualizadaDocEmail.data() : caravanaParaEmail; // Fallback

                const participantesSnapshot = await db.collection('participantes').where('caravanaId', '==', caravanaId).get();
                if (!participantesSnapshot.empty) {
                    const localidadeInfoEmail = await getLocalidadeData(caravanaFinalDataEmail.localidadeId);
                    const nomeLocalidadeEmail = localidadeInfoEmail.nomeLocalidade || 'Destino Desconhecido';
                    const dataFormatadaEmail = await formatDate(caravanaFinalDataEmail.data);
                    const pontoEncontroEmail = caravanaFinalDataEmail.pontoEncontro || 'A definir (verifique próximo à data)';
                    const dataHoraRetornoFormatada = caravanaFinalDataEmail.dataHoraRetorno
                        ? (await formatDate(caravanaFinalDataEmail.dataHoraRetorno)) + ' às ' + new Date(caravanaFinalDataEmail.dataHoraRetorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                        : 'A definir';


                    const emailSubject = `Transporte Confirmado - Caravana ${nomeLocalidadeEmail} (${dataFormatadaEmail})`;

                    console.log(`[${caravanaId}] Preparando ${participantesSnapshot.size} emails de confirmação de transporte (Manual)...`);

                    for (const participanteDoc of participantesSnapshot.docs) {
                        const participante = participanteDoc.data();
                        const participanteId = participanteDoc.id;

                        let veiculoAtribuido = null;
                        let indiceVeiculo = -1;
                        for(let i = 0; i < transportesSalvosComAtribuicao.length; i++) {
                            if(transportesSalvosComAtribuicao[i].participantesAtribuidos?.includes(participanteId)) {
                                veiculoAtribuido = transportesSalvosComAtribuicao[i];
                                indiceVeiculo = i + 1;
                                break;
                            }
                        }

                        let transporteDesc = `Transporte ${indiceVeiculo}: ${veiculoAtribuido?.nomeTipo || 'Tipo não informado'}.`;
                        if (veiculoAtribuido && veiculoAtribuido.placa) {
                            transporteDesc += ` (Placa: ${veiculoAtribuido.placa})`;
                        }
                        if (!veiculoAtribuido) {
                             transporteDesc = "Seu veículo específico será confirmado. Por favor, verifique os detalhes com a organização.";
                             console.warn(`Participante ${participanteId} não encontrado em nenhum veículo atribuído para caravana ${caravanaId}`);
                        }

                        const emailHtml = `
                            <p>Olá!</p>
                            <p>Boas notícias! O transporte para a caravana com destino a ${nomeLocalidadeEmail} na data ${dataFormatadaEmail} foi confirmado.</p>
                            <p>Você foi alocado(a) no ${transporteDesc}</p>
                            <p>Ponto de Encontro: ${pontoEncontroEmail}</p>
                            <p>Horário de Saída Previsto: ${caravanaFinalDataEmail.horarioSaida || 'A definir'}</p>
                            <p>Retorno Estimado: ${dataHoraRetornoFormatada}</p>
                            <p>Mais informações sobre o ponto de encontro exato e outras instruções importantes serão enviadas mais próximo à data da viagem ou podem ser consultadas diretamente com a organização.</p>
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
//                                 <p>Informamos que a caravana para ${nomeLocalidade} marcada para ${formatDate(caravana.data)} foi cancelada automaticamente por não atingir o número mínimo de participantes até a data limite.</p>
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
    console.log('[CRON] Iniciando: Confirmação/Cancelamento Pós-Vendas...');
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const dataOntemStr = ontem.toISOString().split('T')[0];

    try {
        const caravanasPendentesSnap = await db.collection('caravanas')
            .where('dataFechamentoVendas', '==', dataOntemStr)
            .where('status', '==', 'nao_confirmada')
            .get();

        if (caravanasPendentesSnap.empty) {
            console.log('[CRON] Pós-Vendas: Nenhuma caravana para processar.');
            return;
        }

        console.log(`[CRON] Pós-Vendas: Verificando ${caravanasPendentesSnap.size} caravanas.`);

        for (const doc of caravanasPendentesSnap.docs) {
            const caravanaId = doc.id;
            const caravana = doc.data();
            const caravanaRef = db.collection('caravanas').doc(caravanaId);

            const ocupacaoMinima = caravana.ocupacaoMinima || 0;
            const vagasOcupadas = caravana.vagasOcupadas || 0;
            const ocupacaoAtingida = vagasOcupadas >= ocupacaoMinima;

            let transporteCompleto = false;
            const transporteDefinido = caravana.transporteDefinidoManualmente === true || caravana.transporteAutoDefinido === true;

            if (transporteDefinido && Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0) {
                transporteCompleto = caravana.transportesFinalizados.every(
                    veiculo => veiculo.placa && veiculo.motoristaUid && veiculo.administradorUid
                );
            }

            let updateData = { lastUpdate: admin.firestore.FieldValue.serverTimestamp() };
            let motivo = '';
            let notificarParticipantesConfirmacao = false;
            let notificarParticipantesCancelamento = false;

            if (ocupacaoAtingida && transporteCompleto) {
                updateData.status = 'confirmada';
                updateData.confirmadaEm = admin.firestore.FieldValue.serverTimestamp();
                motivo = 'Confirmada automaticamente: ocupação mínima atingida e transporte completo definido.';
                notificarParticipantesConfirmacao = true;
                console.log(`[CRON Pós-Vendas ${caravanaId}]: Confirmando.`);
            } else {
                updateData.status = 'cancelada';
                if (!ocupacaoAtingida && !transporteCompleto) motivo = 'Cancelada: ocupação mínima não atingida e transporte não completamente definido.';
                else if (!ocupacaoAtingida) motivo = 'Cancelada: ocupação mínima não atingida.';
                else motivo = 'Cancelada: transporte não completamente definido (faltam placas/motoristas/admins nos veículos).';
                updateData.motivoCancelamento = motivo;
                notificarParticipantesCancelamento = true;
                console.log(`[CRON Pós-Vendas ${caravanaId}]: Cancelando. Motivo: ${motivo}`);
            }

            try {
                await caravanaRef.update(updateData);
                const localidadeInfo = await getLocalidadeData(caravana.localidadeId);
                const nomeLocalidade = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';
                const dataFormatada = await formatDate(caravana.data);
                const pontoEncontroFormatado = caravana.pontoEncontro || 'A definir (consulte a organização)';
                const horarioSaidaFormatado = caravana.horarioSaida || 'A definir';
                const dataHoraRetornoFormatada = caravana.dataHoraRetorno
                    ? (await formatDate(caravana.dataHoraRetorno)) + ' às ' + new Date(caravana.dataHoraRetorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'})
                    : 'A definir';

                if (notificarParticipantesConfirmacao) {
                    const participantes = await buscarParticipantesParaNotificacao(caravanaId);
                    if (participantes.length > 0) {
                        const emailSubject = `Caravana Confirmada! - ${nomeLocalidade} (${dataFormatada})`;
                        let transporteDescConfirmacao = "Detalhes do transporte e ponto de encontro serão informados em breve.";
                        if (Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0) {
                            const primeiroVeiculo = caravana.transportesFinalizados[0];
                            transporteDescConfirmacao = `Seu transporte principal é do tipo ${primeiroVeiculo.nomeTipo || 'Não especificado'}.`;
                            if (primeiroVeiculo.placa) transporteDescConfirmacao += ` Placa: ${primeiroVeiculo.placa}.`;
                        }
                        const emailHtml = `
                            <p>Olá!</p>
                            <p>Ótima notícia! A caravana para ${nomeLocalidade} (${dataFormatada}) foi CONFIRMADA!</p>
                            <p>Ponto de Encontro: ${pontoEncontroFormatado}</p>
                            <p>Horário de Saída: ${horarioSaidaFormatado}</p>
                            <p>Retorno Estimado: ${dataHoraRetornoFormatada}</p>
                            <p>${transporteDescConfirmacao}</p>
                            <p>Aguarde mais informações sobre detalhes finais e o seu veículo específico, se houver mais de um.</p>
                            <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                        `;
                        for (const p of participantes) await sendEmail(p.email, emailSubject, emailHtml);
                        console.log(`[CRON Pós-Vendas ${caravanaId}]: E-mails de confirmação (status) enviados.`);
                    }
                } else if (notificarParticipantesCancelamento) {
                    const participantes = await buscarParticipantesParaNotificacao(caravanaId);
                     if (participantes.length > 0) {
                        const emailSubject = `Caravana Cancelada - ${nomeLocalidade} (${dataFormatada})`;
                        const emailHtml = `
                            <p>Olá!</p>
                            <p>Lamentamos informar que a caravana para ${nomeLocalidade} (${dataFormatada}) foi cancelada.</p>
                            <p>Motivo: ${motivo}</p>
                            <p>Informações sobre reembolso serão enviadas em breve.</p>
                            <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                        `;
                        for (const p of participantes) await sendEmail(p.email, emailSubject, emailHtml);
                         console.log(`[CRON Pós-Vendas ${caravanaId}]: E-mails de cancelamento enviados.`);
                    }
                }
            } catch (updateOrEmailError) {
                console.error(`[CRON Pós-Vendas ${caravanaId}]: Erro ao atualizar ou notificar:`, updateOrEmailError);
            }
        }
        console.log('[CRON] Verificação pós-vendas concluída.');
    } catch (error) {
        console.error('[CRON] Erro GERAL na tarefa Pós-Vendas:', error);
    }
};






// ATUALIZADO: Enviar Lembretes DIARIAMENTE para Caravanas Confirmadas
const enviarLembretes = async () => {
    console.log('[CRON] Iniciando: Envio de Lembretes Diários...');
    const hoje = new Date();
    const dataHojeStr = hoje.toISOString().split('T')[0];

    try {
        const caravanasConfirmadasSnap = await db.collection('caravanas')
            .where('status', '==', 'confirmada')
            .where('data', '>', dataHojeStr)
            .get();

        if (caravanasConfirmadasSnap.empty) {
            console.log('[CRON] Lembretes: Nenhuma caravana confirmada para lembrete hoje.');
            return;
        }

        console.log(`[CRON] Lembretes: Enviando para ${caravanasConfirmadasSnap.size} caravanas confirmadas...`);

        for (const doc of caravanasConfirmadasSnap.docs) {
            const caravana = doc.data();
            const caravanaId = doc.id;

            try {
                const participantesNotificar = await buscarParticipantesParaNotificacao(caravanaId);
                if (participantesNotificar.length > 0) {
                    const localidadeInfo = await getLocalidadeData(caravana.localidadeId);
                    const nomeLocalidade = localidadeInfo.nomeLocalidade || 'Destino Desconhecido';
                    const dataFormatadaViagem = await formatDate(caravana.data);
                    const pontoEncontro = caravana.pontoEncontro || 'A definir (consulte a organização)';
                    const horarioSaida = caravana.horarioSaida || 'A definir';
                    const dataHoraRetornoFormatada = caravana.dataHoraRetorno
                        ? (await formatDate(caravana.dataHoraRetorno)) + ' às ' + new Date(caravana.dataHoraRetorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'})
                        : 'A definir';

                    let detalhesTransporteEmail = "<p>O transporte está confirmado! Detalhes específicos como placa, motorista e o seu veículo exato (se houver mais de um) serão informados pela equipe mais próximo à data ou no dia do embarque.</p>";

                    if ((caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido) && Array.isArray(caravana.transportesFinalizados) && caravana.transportesFinalizados.length > 0) {
                         let veiculosStr = "";
                         for (const v of caravana.transportesFinalizados) {
                            veiculosStr += `<li>Tipo: ${v.nomeTipo || 'N/D'} (${v.assentos || 'N/D'} assentos)`;
                            if (v.placa) veiculosStr += ` - Placa: ${v.placa}`;
                            // Opcional: adicionar nome do admin/motorista se já definido e se fizer sentido no lembrete
                            // if (v.motoristaUid) { const mot = await getFuncionarioData(v.motoristaUid); if(mot) veiculosStr += ` - Motorista: ${mot.nome}`;}
                            veiculosStr += `</li>`;
                         }
                         if (veiculosStr) {
                             detalhesTransporteEmail = `<p>Veículos Planejados para a Caravana:</p><ul>${veiculosStr}</ul> <p>Você será informado sobre seu veículo específico e os responsáveis mais próximo à data.</p>`;
                         }
                    }

                    const emailSubject = `Lembrete: Sua Caravana para ${nomeLocalidade} é em ${dataFormatadaViagem}!`;
                    const emailHtml = `
                        <p>Olá!</p>
                        <p>Este é um lembrete sobre sua caravana confirmada para ${nomeLocalidade} no dia ${dataFormatadaViagem}.</p>
                        <p>Ponto de Encontro: ${pontoEncontro}</p>
                        <p>Horário de Saída: ${horarioSaida}</p>
                        <p>Retorno Estimado: ${dataHoraRetornoFormatada}</p>
                        ${detalhesTransporteEmail}
                        <p>Prepare-se para uma ótima viagem!</p>
                        <p>Atenciosamente,<br/>Equipe Caravana da Boa Viagem</p>
                    `;

                    console.log(`[CRON Lembrete ${caravanaId}] Preparando ${participantesNotificar.length} emails...`);
                    for (const participante of participantesNotificar) {
                        await sendEmail(participante.email, emailSubject, emailHtml);
                    }
                    console.log(`[CRON Lembrete ${caravanaId}] Lembretes enviados.`);
                }
            } catch (lembreteError) {
                console.error(`[CRON Lembrete ${caravanaId}] Erro ao processar lembretes:`, lembreteError);
            }
        }
        console.log('[CRON] Envio de Lembretes Diários concluído.');
    } catch (error) {
        console.error('[CRON] Erro GERAL no envio de Lembretes:', error);
    }
};




const finalizarTransporteAutomaticamente = async () => {
    console.log('[CRON] Iniciando: Finalização Automática de Transporte...');
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const dataOntemStr = ontem.toISOString().split('T')[0];

    try {
        const caravanasParaFinalizarSnap = await db.collection('caravanas')
            .where('dataConfirmacaoTransporte', '==', dataOntemStr)
            .where('transporteDefinidoManualmente', '==', false)
            .where('transporteAutoDefinido', '==', false)
            .where('status', '==', 'nao_confirmada')
            .get();

        if (caravanasParaFinalizarSnap.empty) {
            console.log('[CRON] Finalização Auto: Nenhuma caravana não confirmada para processar hoje.');
            return;
        }

        console.log(`[CRON] Finalização Auto: Encontradas ${caravanasParaFinalizarSnap.size} caravanas.`);
        const tiposSnapshot = await db.collection('transportes').orderBy('assentos', 'desc').get();
        const tiposDisponiveis = tiposSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (tiposDisponiveis.length === 0) {
            console.error("[CRON] Finalização Auto: Nenhum tipo de transporte cadastrado no sistema. Impossível alocar.");
            return;
        }

        for (const doc of caravanasParaFinalizarSnap.docs) {
            const caravanaId = doc.id;
            const caravana = doc.data();
            const caravanaRef = db.collection('caravanas').doc(caravanaId);
            const vagasOcupadas = caravana.vagasOcupadas || 0;
            const maxVeiculos = caravana.maximoTransportes || 0;
            const ocupacaoMinima = caravana.ocupacaoMinima || 0;

            const pessoasParaAlocacaoInicial = vagasOcupadas + 1;

            console.log(`[CRON] Processando ${caravanaId}: ${vagasOcupadas} clientes, ${maxVeiculos} max veículos. Tentando alocar para ${pessoasParaAlocacaoInicial} (com 1 admin).`);

            const alocacaoParaPessoasComAdminGeral = await alocarTransporteOtimizado(pessoasParaAlocacaoInicial, maxVeiculos, tiposDisponiveis);

            if (!alocacaoParaPessoasComAdminGeral.sucesso || alocacaoParaPessoasComAdminGeral.combinacao.length === 0) {
                console.error(`[CRON ${caravanaId}] Falha inicial ao tentar alocar para ${pessoasParaAlocacaoInicial} pessoas com ${maxVeiculos} veículos: ${alocacaoParaPessoasComAdminGeral.erro}`);
                 try {
                      await caravanaRef.update({
                          status: 'cancelada',
                          motivoCancelamento: `Falha crítica na alocação automática de transporte: ${alocacaoParaPessoasComAdminGeral.erro || 'Não foi possível encontrar veículos.'}`,
                          transporteAutoDefinido: true,
                          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                      });
                      console.log(`[CRON ${caravanaId}] Caravana cancelada por falha crítica na alocação.`);
                       // Opcional: Enviar email de cancelamento aos participantes
                       const participantesParaCancelar = await buscarParticipantesParaNotificacao(caravanaId);
                       if(participantesParaCancelar.length > 0){
                           const localidadeInfoCancel = await getLocalidadeData(caravana.localidadeId);
                           const nomeLocalidadeCancel = localidadeInfoCancel.nomeLocalidade || 'Destino Desconhecido';
                           const dataFormatadaCancel = await formatDate(caravana.data);
                           const emailSubject = `Caravana Cancelada - ${nomeLocalidadeCancel} (${dataFormatadaCancel})`;
                           const emailHtml = `<p>Olá! A caravana para ${nomeLocalidadeCancel} em ${dataFormatadaCancel} foi cancelada devido a: Falha na alocação automática do transporte (${alocacaoParaPessoasComAdminGeral.erro || 'Não foi possível encontrar veículos adequados.'}). Contato sobre reembolso em breve.</p>`;
                           for(const p of participantesParaCancelar) await sendEmail(p.email, emailSubject, emailHtml);
                           console.log(`[CRON ${caravanaId}] Emails de cancelamento (falha alocação) enviados.`);
                       }
                 } catch(cancelError) { console.error(`[CRON ${caravanaId}] Erro ao cancelar caravana:`, cancelError); }
                continue;
            }

            const numVeiculosNaAlocacaoOtima = alocacaoParaPessoasComAdminGeral.combinacao.reduce((sum, item) => sum + item.quantidade, 0);
            const pessoasNecessariasReais = vagasOcupadas + numVeiculosNaAlocacaoOtima;

            console.log(`[CRON ${caravanaId}]: Aloc. inicial sugere ${numVeiculosNaAlocacaoOtima} veículos. Recalculando para ${pessoasNecessariasReais} pessoas (com ${numVeiculosNaAlocacaoOtima} admins).`);
            const alocacaoFinal = await alocarTransporteOtimizado(pessoasNecessariasReais, maxVeiculos, tiposDisponiveis);
            let transportesComAtribuicao = null;
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
                     console.error(`[CRON ERRO LÓGICO ${caravanaId}]: Cap Final ${capacidadeFinalCalculada} < Vagas ${vagasOcupadas} + Admins ${numAdminsFinais}. Cancelando por segurança.`);
                      await caravanaRef.update({
                          status: 'cancelada',
                          motivoCancelamento: `Erro interno: Capacidade final (${capacidadeFinalCalculada}) insuficiente para ${vagasOcupadas} clientes + ${numAdminsFinais} admin(s) após alocação.`,
                          transporteAutoDefinido: true,
                          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                      });
                       // Opcional: Enviar email de cancelamento
                     continue;
                 }

                transportesComAtribuicao = await distribuirParticipantes(caravanaId, transportesBase);

                console.log(`[CRON ${caravanaId}]: Alocado ${JSON.stringify(alocacaoFinal.combinacao)}, Capacidade ${capacidadeFinalCalculada}. Atualizando Firestore...`);
                try {
                    // Não muda o status para 'confirmada' aqui. Isso é responsabilidade do job 'confirmarOuCancelarPosVendas'
                    await caravanaRef.update({
                        transportesFinalizados: transportesComAtribuicao,
                        capacidadeFinalizada: capacidadeFinalCalculada,
                        transporteAutoDefinido: true,
                        transporteDefinidoManualmente: false,
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[CRON ${caravanaId}]: Transporte finalizado automaticamente.`);

                    // Envio de Email APENAS para o Admin
                    try {
                         const localidadeInfoCron = await getLocalidadeData(caravana.localidadeId);
                         const nomeLocalidadeCron = localidadeInfoCron.nomeLocalidade || 'Destino Desconhecido';
                         const dataFormatadaViagemCron = await formatDate(caravana.data);
                         const dataFormatadaConfCron = await formatDate(caravana.dataConfirmacaoTransporte);

                         const emailSubjectAdmin = `Ação Necessária: Transporte Definido Automaticamente - ${nomeLocalidadeCron} (${dataFormatadaViagemCron})`;
                         const formatarVeiculosParaAdmin = (veiculos) => {
                             if (!veiculos || veiculos.length === 0) return "<li>Nenhum veículo definido.</li>";
                             return veiculos.map((v, i) => `<li>Veículo ${i + 1}: ${v.nomeTipo} (${v.assentos} assentos) - ${v.participantesAtribuidos?.length || 0} participantes atribuídos</li>`).join('');
                         };
                         const emailHtmlAdmin = `
                             <p>Olá Administrador,</p>
                             <p>O sistema definiu automaticamente os veículos para a caravana ${nomeLocalidadeCron} (Data: ${dataFormatadaViagemCron}) com base nos participantes inscritos até a data de confirmação (${dataFormatadaConfCron}).</p>
                             <p>Veículos Definidos Automaticamente:</p>
                             <ul>${formatarVeiculosParaAdmin(transportesComAtribuicao)}</ul>
                             <p>Capacidade Final Definida: ${capacidadeFinalCalculada}</p>
                             <p>Ação Necessária: Acesse o painel para revisar, atribuir placas, motoristas e administradores por veículo.</p>
                             <p>Atenciosamente,<br/>Sistema Caravana da Boa Viagem</p>
                         `;
                         await sendEmail(process.env.ADMIN_EMAIL, emailSubjectAdmin, emailHtmlAdmin);
                         console.log(`[CRON ${caravanaId}] Email de notificação (Auto) enviado para admin.`);
                    } catch (emailError) {
                         console.error(`[CRON ${caravanaId}] Erro ao enviar email para admin (Auto):`, emailError);
                    }

                } catch (updateError) {
                     console.error(`[CRON] Erro ao ATUALIZAR ${caravanaId}:`, updateError);
                }

            } else { // Falha na alocação
                 console.error(`[CRON] FALHA ao alocar transporte para ${caravanaId} (${pessoasParaAlocacaoInicial} pessoas -> ${pessoasNecessariasReais} reais, ${maxVeiculos} veículos): ${alocacaoFinal.erro}`);
                 try {
                      await caravanaRef.update({
                          status: 'cancelada',
                          motivoCancelamento: `Falha na alocação automática de transporte: ${alocacaoFinal.erro || 'Não foi possível encontrar veículos adequados.'}`,
                          transporteAutoDefinido: true,
                          lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                      });
                      console.log(`[CRON ${caravanaId}]: Caravana cancelada por falha na alocação automática.`);
                       const participantesParaCancelar = await buscarParticipantesParaNotificacao(caravanaId);
                       if(participantesParaCancelar.length > 0){
                           const localidadeInfoCancel = await getLocalidadeData(caravana.localidadeId);
                           const nomeLocalidadeCancel = localidadeInfoCancel.nomeLocalidade || 'Destino Desconhecido';
                           const dataFormatadaCancel = await formatDate(caravana.data);
                           const emailSubject = `Caravana Cancelada - ${nomeLocalidadeCancel} (${dataFormatadaCancel})`;
                           const emailHtml = `<p>Olá! A caravana para ${nomeLocalidadeCancel} em ${dataFormatadaCancel} foi cancelada devido a: Falha na alocação automática do transporte (${alocacaoFinal.erro || 'Não foi possível encontrar veículos adequados.'}). Contato sobre reembolso em breve.</p>`;
                           for(const p of participantesParaCancelar) await sendEmail(p.email, emailSubject, emailHtml);
                           console.log(`[CRON ${caravanaId}] Emails de cancelamento (falha alocação) enviados.`);
                       }
                 } catch(cancelError) { console.error(`[CRON] Erro CANCELAR ${caravanaId}:`, cancelError); }
            }
        }
        console.log('[CRON] Finalização Automática de Transporte concluída.');
    } catch (error) {
        console.error('[CRON] Erro GERAL na tarefa de Finalização Automática:', error);
    }
};





app.get('/auth/me', verificarAutenticacao, async (req, res) => {
    const uid = req.user.uid; // UID do usuário autenticado vindo do token
    const email = req.user.email; // Email do usuário autenticado

    console.log(`[GET /auth/me] Buscando perfil para UID: ${uid}, Email: ${email}`);

    try {
        if (email === process.env.ADMIN_EMAIL) {
            console.log(`[GET /auth/me] Usuário é ADMIN.`);
            // Busca dados do admin na coleção 'funcionarios' se existir, senão retorna dados básicos
            const adminFuncData = await getFuncionarioData(uid); // Busca pelo UID
            return res.status(200).json({
                uid: uid,
                nome: adminFuncData?.nome || email, // Nome do Firestore ou fallback para email
                email: email,
                tipo: 'admin', // Identifica o tipo
                // Adicione outros campos se relevantes para o header/contexto
            });
        }

        // 2. Tenta buscar na coleção 'users'
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            console.log(`[GET /auth/me] Encontrado na coleção 'users'.`);
            const userData = userDoc.data();
            return res.status(200).json({
                uid: uid,
                nome: userData.nome || email, // Nome do Firestore ou fallback para email
                email: userData.email || email, // Email do Firestore ou fallback
                telefone: userData.telefone || null,
                fotoUrl: userData.fotoUrl || req.user.photoURL || null, // Prioriza Firestore, depois Auth
                tipo: 'user'
            });
        }

        // 3. Se não achou em 'users', tenta buscar em 'funcionarios'
        console.log(`[GET /auth/me] Não encontrado em 'users', buscando em 'funcionarios'...`);
        // Usamos a função getFuncionarioData que já busca por ID do doc ou campo uid
        const funcionarioData = await getFuncionarioData(uid);
        if (funcionarioData) {
            console.log(`[GET /auth/me] Encontrado na coleção 'funcionarios' como ${funcionarioData.cargo}.`);
            return res.status(200).json({
                uid: uid,
                nome: funcionarioData.nome || email,
                email: funcionarioData.email || email,
                telefone: funcionarioData.telefone || null,
                fotoUrl: funcionarioData.fotoUrl || req.user.photoURL || null,
                tipo: funcionarioData.cargo || 'funcionario' // Usa o cargo como tipo
            });
        }

        // 4. Se não achou em nenhuma coleção (mas está autenticado)
        console.warn(`[GET /auth/me] Usuário autenticado (UID: ${uid}) não encontrado em 'users' ou 'funcionarios'.`);
        return res.status(404).json({
            error: 'Registro do usuário não encontrado no sistema.',
            // Pode retornar dados básicos do Auth se desejar
             uid: uid,
             email: email,
             nome: req.user.displayName || email, // Nome do Auth ou email
             tipo: 'unknown'
        });

    } catch (error) {
        console.error(`[GET /auth/me] Erro ao buscar perfil para UID ${uid}:`, error);
        res.status(500).json({ error: "Erro interno ao buscar dados do perfil." });
    }
});



app.get('/caravanas/:caravanaId/meus-ingressos', verificarAutenticacao, async (req, res) => {
    const { caravanaId } = req.params;
    const usuarioUid = req.user.uid; // Pega o UID do usuário autenticado pelo middleware

    if (!caravanaId || !usuarioUid) {
        return res.status(400).json({ error: "ID da Caravana e ID do Usuário são necessários." });
    }

    console.log(`[Meus Ingressos] Buscando ingressos para Usuário ${usuarioUid} na Caravana ${caravanaId}`);

    try {
        // Verifica se a caravana existe (opcional, mas bom para evitar buscas inúteis)
        const caravanaDoc = await db.collection('caravanas').doc(caravanaId).get();
        if (!caravanaDoc.exists) {
             console.log(`[Meus Ingressos] Caravana ${caravanaId} não encontrada.`);
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }

        // Busca todos os registros de participantes para este usuário NESTA caravana
        const participantesSnapshot = await db.collection('participantes')
            .where('caravanaId', '==', caravanaId)
            .where('uid', '==', usuarioUid) // Filtra pelo UID do usuário logado
            .get();

        let quantidadeTotalUsuario = 0;
        if (!participantesSnapshot.empty) {
            participantesSnapshot.forEach(doc => {
                quantidadeTotalUsuario += doc.data().quantidade || 0; // Soma a quantidade de cada registro de compra
            });
        }

        console.log(`[Meus Ingressos] Usuário ${usuarioUid} tem ${quantidadeTotalUsuario} ingresso(s) para Caravana ${caravanaId}.`);

        // Retorna apenas a quantidade total
        res.status(200).json({ quantidadeTotalUsuario: quantidadeTotalUsuario });

    } catch (error) {
        console.error(`[Meus Ingressos] Erro ao buscar ingressos do usuário ${usuarioUid} para caravana ${caravanaId}:`, error);
        res.status(500).json({ error: "Erro interno ao buscar quantidade de ingressos." });
    }
});





//pros cron job funcionar

app.get('/api/cron/pos-vendas', async (req, res) => {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[${agora}] Endpoint /api/cron/pos-vendas chamado.`);
  try {

    const resultado = await confirmarOuCancelarPosVendas();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error(`[${agora}] Erro no endpoint /api/cron/pos-vendas:`, error);
    res.status(500).json({ success: false, error: 'Erro interno ao processar pós-vendas.' });
  }
});


app.get('/api/cron/enviar-lembretes', async (req, res) => {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[${agora}] Endpoint /api/cron/enviar-lembretes chamado.`);
  try {
    const resultado = await enviarLembretes();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error(`[${agora}] Erro no endpoint /api/cron/enviar-lembretes:`, error);
    res.status(500).json({ success: false, error: 'Erro interno ao enviar lembretes.' });
  }
});

// Endpoint para finalizarTransporteAutomaticamente
app.get('/api/cron/finalizar-transporte-auto', async (req, res) => {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[${agora}] Endpoint /api/cron/finalizar-transporte-auto chamado.`);
  try {
    const resultado = await finalizarTransporteAutomaticamente();
    res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error(`[${agora}] Erro no endpoint /api/cron/finalizar-transporte-auto:`, error);
    res.status(500).json({ success: false, error: 'Erro interno ao finalizar transporte.' });
  }
});


// cron.schedule('0 0 * * *', enviarLembretes, { scheduled: true, timezone: "America/Sao_Paulo" }); 
// cron.schedule('0 0 * * *', confirmarOuCancelarPosVendas, { scheduled: true, timezone: "America/Sao_Paulo" });
// cron.schedule('0 0 * * *', finalizarTransporteAutomaticamente, { scheduled: true, timezone: "America/Sao_Paulo"});











app.get('/health-check', (req, res) => {
    console.log('Health check ping recebido!');
    res.status(200).send('OK');
  });

  

  
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}`);
});