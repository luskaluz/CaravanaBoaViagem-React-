require("dotenv").config();
const express = require("express");
const firebaseAdmin = require("firebase-admin");
const path = require("path");
const cors = require('cors');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
});

const db = firebaseAdmin.firestore();
app.use(express.json());
app.use(cors());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: "caravanadaboaviagem@gmail.com",
        pass: "xlxxrmxporaryirv"  // Use a senha de app
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Função auxiliar para formatar datas
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return dateString;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

async function buscarUsuariosParaNotificacao(caravanaId, tipoNotificacao) {
    console.log(`Buscando usuários para caravanaId: ${caravanaId}, tipo: ${tipoNotificacao}`);
    const usuarios = new Set();
    const usuariosObjs = [];

    switch (tipoNotificacao) {
        case 'cancelamento':
        case "exclusao":
        case 'lembrete':
        case 'confirmacao':
            const participantesSnapshot = await db.collection("participantes")
                .where("caravanaId", "==", caravanaId)
                .get();
            console.log("participantesSnapshot.size:", participantesSnapshot.size);

            participantesSnapshot.forEach(doc => {
                const participante = doc.data();
                console.log("  Participante:", doc.id, participante);

                if (participante.email) {
                    if (!usuarios.has(participante.email)) {
                        usuarios.add(participante.email);
                        usuariosObjs.push({ email: participante.email, tipo: 'participante' });
                    }
                }
            });
            break;
       //outros
    }
    console.log("Usuários encontrados:", usuariosObjs);
    return usuariosObjs;
}

const validarDadosCadastro = (nome, email, telefone, idade) => {
    if (!nome || !email || !telefone || !idade) {
        return "Todos os campos são obrigatórios.";
    }
    const regexTelefone = /^\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}$/;
    if (!regexTelefone.test(telefone)) {
        return "Telefone inválido. Use (XX) XXXX-XXXX ou (XX) XXXXX-XXXX.";
    }

    if (typeof idade !== 'number' || idade <= 18) {
        return "Você deve ser um adulto para realizar o cadastro.";
    }

    return null;
};

const verificarAutenticacao = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();

    } catch (error) {
        console.error("Erro ao verificar autenticação:", error);

        if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked') {
            return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
        }
        res.status(500).json({ error: "Erro ao verificar autenticação." });
    }
};

async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: '"Caravana da Boa Viagem" <caravanadaboaviagem@gmail.com>',
            to,
            subject,
            html,
        };
        const info = await transporter.sendMail(mailOptions);
        console.log('Email enviado:', info.messageId, 'para:', to);
        return info;
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        throw new Error('Falha ao enviar email: ' + error.message);
    }
}

app.post("/register", async (req, res) => {
    const { uid, nome, email, telefone, idade } = req.body;
    const erroValidacao = validarDadosCadastro(nome, email, telefone, idade);

    if (erroValidacao) {
        return res.status(400).json({ error: erroValidacao });
    }

    try {
        await db.collection("users").doc(uid).set({
            nome,
            email,
            telefone,
            idade: parseInt(idade, 10),
        });
        res.status(201).json({ message: "Usuário registrado com sucesso!" });
    } catch (error) {
        console.error("Erro ao salvar:", error);
        res.status(500).json({ error: "Erro ao registrar usuário." });
    }
});

app.get("/user/:uid", async (req, res) => {
    const { uid } = req.params;

    try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }
        res.status(200).json(userDoc.data());
    } catch (error) {
        console.error("Erro ao buscar dados:", error);
        res.status(500).json({ error: "Erro ao buscar dados do usuário." });
    }
});

const verificarAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
        }
        const idToken = authHeader.split('Bearer ')[1];

        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

        const email = decodedToken.email;

        if (email !== "adm@adm.com") {  //  Verifique se o email é do administrador
            return res.status(403).json({ error: "Acesso negado." });
        }

        req.user = decodedToken; // Adiciona o token decodificado
        next();

    } catch (error) {
        console.error("Erro ao verificar admin:", error);

        if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked') {
            return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
        }
        res.status(500).json({ error: "Erro ao verificar permissões." });
    }
};

//  Funcionários

app.post('/funcionarios', verificarAdmin, async (req, res) => {
    try {
          const { nome, email, salario, telefone, senha } = req.body;

          if (!nome) return res.status(400).json({ error: "O campo 'nome' é obrigatório." });
          if (!email) return res.status(400).json({ error: "O campo 'email' é obrigatório." });
          if (!senha) return res.status(400).json({ error: "O campo 'senha' é obrigatório." });
          if (!salario) return res.status(400).json({ error: "O campo 'salario' é obrigatório." });
          if (!telefone) return res.status(400).json({ error: "O campo 'telefone' é obrigatório." });
          if (typeof nome !== "string") return res.status(400).json({ error: "O campo 'nome' deve ser string." });
          if (typeof email !== 'string') return res.status(400).json({ error: "O campo 'email' deve ser string." });
          if (typeof salario !== 'number') return res.status(400).json({ error: "O campo 'salario' deve ser numérico." });
          if (typeof telefone !== 'string') return res.status(400).json({ error: "O campo 'telefone' deve ser string." });
          if (senha.length < 6) return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });

           if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              return res.status(400).json({ error: "Formato de email inválido." });
          }

           const phoneRegex = /^(?:(?:\+\d{2}\s?)?(?:9?\d{4})[-.\s]?\d{4})$/;;

          if (!phoneRegex.test(telefone)) {
              return res.status(400).json({ error: "Formato de telefone inválido. Use apenas números (10 ou 11 dígitos)." });
           }

          const userRecord = await admin.auth().createUser({
              email: email,
              password: senha,
          });

          const novoFuncionario = {
              nome,
              email,
              salario: salario,
              telefone: telefone,
              uid: userRecord.uid,
          };
          const docRef = await db.collection('funcionarios').add(novoFuncionario);

          res.status(201).json({ id: docRef.id, uid: userRecord.uid, ...novoFuncionario });

      } catch (error) {
         console.error('Erro ao criar funcionário:', error);
          if (error.code === 'auth/email-already-exists') {
              return res.status(400).json({ error: 'Este email já está em uso.' });
          }
          if (error.code === 'auth/invalid-email') {
              return res.status(400).json({ error: "Formato de email inválido (auth)." });
          }
           if (error.code === 'auth/weak-password') {
              return res.status(400).json({ error: "A senha fornecida é muito fraca." });
          }
          res.status(500).json({ error: 'Erro interno ao criar funcionário.' });
      }
  });

app.get('/funcionarios', async (req, res) => {
  try {
      const snapshot = await db.collection('funcionarios').get();
      const funcionarios = [];
       snapshot.forEach(doc => {
          funcionarios.push({ id: doc.id, ...doc.data() });
       })
      res.status(200).json(funcionarios);
  } catch (error) {
      console.error("Erro ao listar funcionários:", error);
      res.status(500).json({ error: "Erro interno ao listar funcionários." });
  }
});

app.put('/funcionarios/:id', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, salario, telefone } = req.body;

        if (!nome) {
            return res.status(400).json({ error: "O campo 'nome' é obrigatório para atualização." });
        }

         if (typeof nome !== 'string') {
            return res.status(400).json({error: "O campo 'nome' é do tipo string"})
        }

        if (email && typeof email !== 'string') {
            return res.status(400).json({ error: "O campo 'email' deve ser uma string." });
        }

         if (salario && typeof salario !== 'number') {
            return res.status(400).json({ error: "O campo 'salario' deve ser um número." });
        }
        if (telefone && typeof telefone !== 'string') {
            return res.status(400).json({ error: "O campo 'telefone' deve ser um string." });
        }

        const funcionarioAtualizado = {};

        if (nome) funcionarioAtualizado.nome = nome;
        if (email !== undefined) funcionarioAtualizado.email = email;
        if(salario !== undefined) funcionarioAtualizado.salario = salario;
        if(telefone !== undefined) funcionarioAtualizado.telefone = telefone;

        const funcionarioRef = db.collection('funcionarios').doc(id);
        const funcDoc = await funcionarioRef.get();

         if (!funcDoc.exists) {
            return res.status(404).json({ error: 'Funcionário não encontrado.' });
        }

        await funcionarioRef.update(funcionarioAtualizado);
        res.status(200).json({ message: 'Funcionário atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ error: 'Erro ao atualizar funcionário.' });
    }
});

app.delete('/funcionarios/:id', verificarAdmin, async (req, res) => {
    try{
    const { id } = req.params;

    const funcionariosRef = db.collection('funcionarios').doc(id)
    const funcDoc = await funcionariosRef.get();

     if (!funcDoc.exists) {
            return res.status(404).json({ error: 'Funcionário não encontrado.' });
          }
      await funcionariosRef.delete()

    res.status(200).json({ message: "Funcionário excluído com sucesso." });

    } catch(error){
        console.error("Erro ao excluir funcionário:", error);
        res.status(500).json({ error: "Erro interno ao excluir funcionário " });
    }
});

app.get('/funcionarios/:uid/caravanas', async (req, res) => {
    try {
        const { uid } = req.params;

        const funcionarioDoc = await db.collection('funcionarios').where('uid', '==', uid).get();
        if (funcionarioDoc.empty) {
            return res.status(404).json({ error: 'Funcionário não encontrado.' });
        }
        const funcionarioId = funcionarioDoc.docs[0].id;

        const caravanasSnapshot = await db.collection('caravanas')
            .where('administradorId', '==', funcionarioId)
            .get();

        const caravanas = [];
        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();

            const localidadeDoc = await db.collection('localidades').doc(caravana.localidadeId).get();
            const localidadeData = localidadeDoc.exists ? {
                nomeLocalidade: localidadeDoc.data().nome,
                imagensLocalidade: localidadeDoc.data().imagens,
            } : {};

            caravanas.push({ id: doc.id, ...caravana, ...localidadeData });
        }

        res.status(200).json(caravanas);

    } catch (error) {
        console.error('Erro ao buscar caravanas do funcionário:', error);
        res.status(500).json({ error: 'Erro interno ao buscar caravanas do funcionário.' });
    }
});

//  Caravanas

app.post('/caravanas', verificarAdmin, async (req, res) => {
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


        const preco = (parseFloat(despesas) + parseFloat(lucroAbsoluto)) / parseInt(ocupacaoMinima);
        if (isNaN(preco)) {
            return res.status(400).json({ error: "Erro ao calcular o preço. Verifique os valores." });
        }

        const novaCaravana = {
            localidadeId,
            data,
            horarioSaida: horarioSaida || null,
            vagasTotais: parseInt(vagasTotais),
            vagasDisponiveis: parseInt(vagasTotais),
            despesas: parseFloat(despesas),
            lucroAbsoluto: parseFloat(lucroAbsoluto),
            ocupacaoMinima: parseInt(ocupacaoMinima),
            preco,
            status: "nao_confirmada",
            nomeAdministrador,
            emailAdministrador,
            telefoneAdministrador
        };

        const docRef = await db.collection('caravanas').add(novaCaravana);
        res.status(201).json({ id: docRef.id, ...novaCaravana });

    } catch (error) {
       res.status(500).json(error.message, error)
    }
});

app.put('/caravanas/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        localidadeId,
        data,
        horarioSaida,
        vagasTotais,
        despesas,
        lucroAbsoluto,
        ocupacaoMinima,
        preco,
        nomeAdministrador,
        emailAdministrador,
        telefoneAdministrador
    } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(id);
        const caravanaDoc = await caravanaRef.get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        if (!localidadeId || !data || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD." });
        }

        const localidadeRef = db.collection('localidades').doc(localidadeId);
        const localidadeDoc = await localidadeRef.get();

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        const localidadeData = localidadeDoc.data();

        await caravanaRef.update({
            localidadeId,
            nomeLocalidade: localidadeData.nome,
            data,
            horarioSaida,
            vagasTotais: parseInt(vagasTotais, 10),
            despesas: parseFloat(despesas),
            lucroAbsoluto: parseFloat(lucroAbsoluto),
            ocupacaoMinima: parseInt(ocupacaoMinima, 10),
            preco: parseFloat(preco),
            nomeAdministrador,
            emailAdministrador,
            telefoneAdministrador

        });

        const caravanaAtualizadaDoc = await caravanaRef.get();
        const caravanaAtualizada = caravanaAtualizadaDoc.data();

        if (caravanaAtualizada.status === 'confirmada') {
            const emails = await buscarUsuariosParaNotificacao(id, "confirmacao");
            const emailSubject = `Caravana para ${caravanaAtualizada.nomeLocalidade} Confirmada!`;
            const emailHtml = `
              <p>Olá!</p>
              <p>A caravana para ${caravanaAtualizada.nomeLocalidade} na data ${formatDate(caravanaAtualizada.data)} foi confirmada!</p>
              <p>Detalhes:</p>
              <ul>
                <li>Localidade: ${caravanaAtualizada.nomeLocalidade}</li>
                <li>Data: ${formatDate(caravanaAtualizada.data)}</li>
                <li>Horário de Saída: ${caravanaAtualizada.horarioSaida || 'A definir'}</li>
              </ul>
            `;

            for (const emailObj of emails) {
                await sendEmail(emailObj.email, emailSubject, emailHtml);
            }
        }
        res.status(200).json({ id: caravanaAtualizadaDoc.id, ...caravanaAtualizada });

    } catch (error) {
        console.error("Erro ao atualizar caravana:", error);
        res.status(500).json({ error: "Erro ao atualizar caravana", details: error.message });
    }
});

app.get("/caravanas/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const caravanaDoc = await db.collection("caravanas").doc(id).get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: "Caravana não encontrada." });
        }
        const caravana = caravanaDoc.data();

        const localidadeDoc = await db.collection('localidades').doc(caravana.localidadeId).get();
        let localidadeData = {};
        if (localidadeDoc.exists) {
            localidadeData = {
                nomeLocalidade: localidadeDoc.data().nome,
                imagensLocalidade: localidadeDoc.data().imagens,
                descricao: localidadeDoc.data().descricao,
            };
        }

        res.status(200).json({
            id: caravanaDoc.id,
            ...caravana,
            ...localidadeData,
        });

    } catch (error) {
        console.error("Erro ao buscar caravana:", error);
        res.status(500).json({ error: "Erro ao buscar caravana." });
    }
});

app.get("/caravanas", async (req, res) => {
    try {
      let caravanasQuery = db.collection("caravanas");
      const { sortBy, status } = req.query;

        if (status) {
            if (!['confirmada', 'nao_confirmada', 'cancelada'].includes(status)) {
              return res.status(400).json({ error: "Status inválido." });
          }
            caravanasQuery = caravanasQuery.where("status", "==", status);
        }

          if (sortBy === 'data') {
              caravanasQuery = caravanasQuery.orderBy('data', 'asc');
          } else if (sortBy === 'lucroAbsoluto') {
              caravanasQuery = caravanasQuery.orderBy('lucroAbsoluto', 'desc');

          } else if(sortBy === 'recentes'){
              caravanasQuery = caravanasQuery.orderBy('data', 'desc');

          } else if (sortBy === 'antigas'){
              caravanasQuery = caravanasQuery.orderBy('data', 'asc')

          }

        const caravanasSnapshot = await caravanasQuery.get();
        const caravanas = [];

        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();

            const localidadeDoc = await db.collection("localidades").doc(caravana.localidadeId).get();
            let localidadeData = {};
            if (localidadeDoc.exists) {
                localidadeData = {
                    nomeLocalidade: localidadeDoc.data().nome,
                    imagensLocalidade: localidadeDoc.data().imagens
                };
            }

             const despesas = parseFloat(caravana.despesas);
             const lucroMaximo = (caravana.preco * caravana.vagasTotais) - despesas;
             const roi =  despesas > 0 ? (lucroMaximo / despesas) * 100 : 0;

             caravanas.push({
                id: doc.id,
                ...caravana,
                ...localidadeData,
                roi: roi,
                lucroMaximo: lucroMaximo,
            });
        }

        if(sortBy === 'roi'){
           caravanas.sort((a,b) => b.roi - a.roi)
        }

        res.status(200).json(caravanas);
    } catch (error) {
        console.error("Erro ao buscar caravanas:", error);
        res.status(500).json({ error: "Erro ao buscar caravanas." });
    }
});

app.get("/caravanas-por-status/:status", async (req, res) => {
    const { status } = req.params;
    if (!['confirmada', 'nao_confirmada', 'cancelada'].includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
    }

    try {
        const caravanasSnapshot = await db.collection("caravanas")
            .where("status", "==", status)
            .get();

        const caravanas = [];
        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();
             const localidadeDoc = await db.collection("localidades").doc(caravana.localidadeId).get();
                let localidadeData = {};
                if(localidadeDoc.exists) {
                    localidadeData = {
                        nomeLocalidade: localidadeDoc.data().nome,
                        imagensLocalidade: localidadeDoc.data().imagens
                    };
                }

                const despesas = parseFloat(caravana.despesas);
                const lucroMaximo = (caravana.preco * caravana.vagasTotais) - despesas;
                const roi =  despesas > 0 ? (lucroMaximo / despesas) * 100 : 0;
                caravanas.push({
                    id: doc.id,
                    ...caravana,
                    ...localidadeData,
                roi: roi,
                lucroMaximo: lucroMaximo,
            });
        }

        res.status(200).json(caravanas);

    } catch (error) {
        console.error("Erro ao buscar caravanas por status:", error);
        res.status(500).json({ error: "Erro ao buscar caravanas por status." });
    }
});

app.delete("/caravanas/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const caravanaRef = db.collection("caravanas").doc(id);
        const caravanaDoc = await caravanaRef.get();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: "Caravana não encontrada." });
        }

        await caravanaRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Erro ao excluir caravana:", error);
        res.status(500).json({ error: "Erro ao excluir caravana: " + error.message });
    }
});

app.put('/cancelar-caravana/:id', verificarAdmin, async (req, res) => {
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

        const localidadeDoc = await db.collection("localidades").doc(caravana.localidadeId).get();
        const nomeLocalidade = localidadeDoc.exists ? localidadeDoc.data().nome : caravana.localidadeId;

        await caravanaRef.update({
            status: 'cancelada',
            motivoCancelamento: motivo || null,
        });

        const emails = await buscarUsuariosParaNotificacao(id, "cancelamento");

        const emailSubject = `Caravana para ${nomeLocalidade} Cancelada`;
        const emailHtml = `
          <p>Olá!</p>
          <p>Informamos que a caravana para ${nomeLocalidade} na data ${formatDate(caravana.data)} foi cancelada.</p>
          ${motivo ? `<p>Motivo: ${motivo}</p>` : ''}
          <p>Entre em contato para mais informações sobre reembolso.</p>
        `;

       for (const emailObj of emails) {
            await sendEmail(emailObj.email, emailSubject, emailHtml);
        }

        res.status(200).json({ message: 'Caravana cancelada com sucesso.' });

    } catch (error) {
        console.error("Erro ao cancelar caravana:", error);
        res.status(500).json({ error: "Erro ao cancelar caravana", details: error.message });
    }
});

app.get('/localidades', async (req, res) => {
    try {
        const localidadesSnapshot = await db.collection('localidades').get();
        const localidades = [];
        localidadesSnapshot.forEach(doc => {
            localidades.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(localidades);
    } catch (error) {
        console.error("Erro ao obter localidades:", error);
        res.status(500).json({ error: "Erro ao obter localidades" });
    }
});

app.post('/localidades', async (req, res) => {
    try {
        const { nome, descricao, imagens } = req.body;

        if (!nome) {
            return res.status(400).json({ error: "O nome da localidade é obrigatório." });
        }

        const novaLocalidadeRef = await db.collection('localidades').add({
            nome,
            descricao: descricao || null,
            imagens: imagens || [],
        });

        const novaLocalidade = await novaLocalidadeRef.get();

        res.status(201).json({ id: novaLocalidade.id, ...novaLocalidade.data() });
    } catch (error) {
        console.error("Erro ao criar localidade:", error);
        res.status(500).json({ error: `Erro ao criar localidade: ${error.message}` });
    }
});

app.put('/localidades/:id', async (req, res) => {
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

        await localidadeRef.update({
            nome,
            descricao: descricao || null,
            imagens: imagens || [],
        });

        const localidadeAtualizada = await localidadeRef.get();
        res.status(200).json({ id: localidadeAtualizada.id, ...localidadeAtualizada.data() });
    }
    catch (error) {
        console.error("Erro ao atualizar localidade:", error);
        res.status(500).json({ error: `Erro ao atualizar localidade: ${error.message}` });

    }
});

app.delete('/localidades/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const localidadeRef = db.collection('localidades').doc(id);
        const localidadeDoc = await localidadeRef.get();

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        await localidadeRef.delete();
        res.status(204).send();
    } catch (error) {
        console.error("Erro ao excluir localidade:", error);
        res.status(500).json({ error: `Erro ao excluir localidade: ${error.message}` });
    }
});

app.get('/localidades/:id/descricao', async (req, res) => {
      const { id } = req.params;
    try {
        const localidadeRef = db.collection('localidades').doc(id);
        const localidadeDoc = await localidadeRef.get();

        if (!localidadeDoc.exists) {
            return res.status(404).json({ error: 'Localidade não encontrada.' });
        }
        const localidade = localidadeDoc.data();
        res.status(200).json({ descricao: localidade.descricao });

    } catch (error) {
        console.error("Erro ao obter descrição da localidade:", error);
    res.status(500).json({ error: "Erro ao obter descrição da localidade: " + error.message });

    }
});

app.post('/comprar-ingresso', verificarAutenticacao, async (req, res) => {
    const { caravanaId, usuarioId, usuarioEmail, quantidade } = req.body;

    try {
        const caravanaRef = db.collection('caravanas').doc(caravanaId);
        let caravanaDoc = await caravanaRef.get();
        let caravana = caravanaDoc.data();

        if (!caravanaDoc.exists) {
            return res.status(404).json({ error: 'Caravana não encontrada.' });
        }
        if (caravana.status === 'cancelada') {
            return res.status(400).json({ error: 'A caravana foi cancelada.' });
        }
        if (caravana.vagasDisponiveis < quantidade) {
            return res.status(400).json({ error: 'Não há vagas suficientes.' });
        }

        await db.runTransaction(async (transaction) => {
            caravanaDoc = await transaction.get(caravanaRef);
            caravana = caravanaDoc.data();

            if (caravana.vagasDisponiveis < quantidade) {
                throw new Error('Não há vagas suficientes.');
            }

            const participantesRef = db.collection('participantes');
            const participanteDoc = await participantesRef.doc(usuarioId).get();

            // Mesmo que o usuário já tenha comprado, sobrescreve a compra anterior (simplifica a lógica)
            await transaction.set(participantesRef.doc(usuarioId), {
                caravanaId,
                email: usuarioEmail,
                nome: req.user.name || null, // Usa o nome do usuário autenticado, se disponível
                uid: usuarioId,
                quantidade: parseInt(quantidade, 10),
                timestamp: firebaseAdmin.firestore.FieldValue.serverTimestamp()
            });

            const novasVagasDisponiveis = caravana.vagasDisponiveis - quantidade;
            transaction.update(caravanaRef, { vagasDisponiveis: novasVagasDisponiveis });

            // Verifica se, *após a compra*, a caravana atinge o mínimo para ser confirmada.
            if (novasVagasDisponiveis <= caravana.vagasTotais - caravana.ocupacaoMinima) {
                transaction.update(caravanaRef, { status: 'confirmada' });
            }
        });

        // Busca a caravana *após* a transação (para ter os dados atualizados, incluindo status)
        const caravanaAposCompra = await caravanaRef.get();
        const caravanaData = caravanaAposCompra.data();

        const emailCompraSubject = `Confirmação de Compra - Caravana para ${caravanaData.nomeLocalidade}`;
        const emailCompraHtml = `
            <p>Olá!</p>
            <p>Sua compra de ${quantidade} ingresso(s) para a caravana com destino a ${caravanaData.nomeLocalidade} foi realizada com sucesso!</p>
            <p>Detalhes:</p>
            <ul>
            <li>Localidade: ${caravanaData.nomeLocalidade}</li>
                <li>Data: ${formatDate(caravanaData.data)}</li>
                <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>>
            ${caravanaData.status === 'confirmada' ? '<li><b>Status:</b> Caravana Confirmada!</li>' : ''}
            </ul>
            <p>Agradecemos a preferência!</p>
        `;
        await sendEmail(usuarioEmail, emailCompraSubject, emailCompraHtml);

        // Envia email de confirmação *SE* a caravana foi confirmada após a compra
        if (caravanaData.status === 'confirmada') {
            const emails = await buscarUsuariosParaNotificacao(caravanaId, "confirmacao");
            const emailConfirmacaoSubject = `Caravana para ${caravanaData.nomeLocalidade} Confirmada!`;
            const emailConfirmacaoHtml = `
              <p>Olá!</p>
              <p>A caravana para ${caravanaData.nomeLocalidade} na data ${formatDate(caravanaData.data)} foi confirmada!</p>
              <p>Detalhes:</p>
              <ul>
                <li>Localidade: ${caravanaData.nomeLocalidade}</li>
                <li>Data: ${formatDate(caravanaData.data)}</li>
                <li>Horário de Saída: ${caravanaData.horarioSaida || 'A definir'}</li>
              </ul>
            `;

            for (const emailObj of emails) {
                await sendEmail(emailObj.email, emailConfirmacaoSubject, emailConfirmacaoHtml);
            }
        }

        res.status(200).json({ message: `${quantidade} ingresso(s) comprado(s) com sucesso!` });

    } catch (error) {
        console.error("Erro ao comprar ingresso:", error);
        const statusCode = error.message === 'Não há vagas suficientes.' ? 400 : 500;  // Trata erros específicos
        res.status(statusCode).json({ error: `Erro ao comprar ingresso: ${error.message}` });
    }
});



app.get("/caravanas/:id/participantes", async (req, res) => {
    const { id } = req.params;

    try {
        const participantesSnapshot = await db.collection("participantes")
            .where("caravanaId", "==", id)
            .get();

        const participantes = [];
        for (const doc of participantesSnapshot.docs) {
            const participante = doc.data();

            const userDoc = await db.collection("users").doc(participante.usuarioId).get();
            if (userDoc.exists) {
                participante.nome = userDoc.data().nome;
                participante.telefone = userDoc.data().telefone;
            }
            participantes.push(participante);
        }

        res.status(200).json(participantes);

    } catch (error) {
        console.error("Erro ao buscar participantes:", error);
        res.status(500).json({ error: "Erro ao buscar participantes." });
    }
});

app.get('/participantes/:caravanaId', async (req, res) => {
    const { caravanaId } = req.params;

    try {
        const participantesSnapshot = await db.collection('participantes')
            .where('caravanaId', '==', caravanaId)
            .get();

        const participantes = [];

        for (const doc of participantesSnapshot.docs) {
            const participante = doc.data();

            const usuarioDoc = await db.collection('usuarios').doc(participante.usuarioId).get();  //  'usuarios' ou 'users'?
            let usuarioData = {};

            if (usuarioDoc.exists) {
                usuarioData = {
                    nome: usuarioDoc.data().nome,
                    telefone: usuarioDoc.data().telefone,
                };
            }

            participantes.push({
                usuarioId: participante.usuarioId,
                usuarioEmail: participante.usuarioEmail,
                quantidade: participante.quantidade,
                ...usuarioData,
            });
        }

        res.status(200).json(participantes);
    } catch (error) {
        console.error("Erro ao buscar participantes:", error);
        res.status(500).json({ error: "Erro ao buscar participantes." });
    }
});

app.get("/caravanas-registradas/:usuarioId", async (req, res) => {
    const { usuarioId } = req.params;

    try {

        const participantesSnapshot = await db.collection("participantes")
            .where("usuarioId", "==", usuarioId)
            .get();

        const caravanasAgrupadas = {};

        for (const doc of participantesSnapshot.docs) {
            const participante = doc.data();
            const caravanaId = participante.caravanaId;

            if (!caravanasAgrupadas[caravanaId]) {
                caravanasAgrupadas[caravanaId] = {
                    id: caravanaId,
                    quantidadeTotal: parseInt(participante.quantidade, 10) || 0,
                };
            } else {
                caravanasAgrupadas[caravanaId].quantidadeTotal +=
                    parseInt(participante.quantidade, 10) || 0;
            }
        }

        const caravanasRegistradas = [];
        for (const caravanaId of Object.keys(caravanasAgrupadas)) {
            const caravanaDoc = await db.collection("caravanas").doc(caravanaId).get();
            if (caravanaDoc.exists && caravanaDoc.data().status !== "cancelada") {
                caravanasRegistradas.push({
                  ...caravanaDoc.data(),
                    id: caravanaDoc.id,
                    quantidadeTotal: caravanasAgrupadas[caravanaId].quantidadeTotal,
                });
            }
        }

        res.status(200).json(caravanasRegistradas);

    } catch (error) {
        console.error("Erro ao buscar caravanas registradas:", error);
        res.status(500).json({ error: "Erro ao buscar caravanas registradas." });
    }
});

app.get("/caravanas-notificacoes/:usuarioEmail", async(req, res) => {
   const { usuarioEmail } = req.params;

   try{
    const inscricoesSnapshot = await db.collection("inscricoes")
    .where("usuarioEmail", "==", usuarioEmail)
    .get()

   const caravanasNotificacoes = [];
      for(const doc of inscricoesSnapshot.docs){
        const inscricao = doc.data()
        const caravanaDoc = await db.collection("caravanas").doc(inscricao.caravanaId).get()

        if(caravanaDoc.exists){
            const caravana = caravanaDoc.data();

            if(caravana.status === "notificacao"){
                caravanasNotificacoes.push({
                    id: caravanaDoc.id,
                    ...caravana
                })
            }
        }
      }
       res.status(200).json(caravanasNotificacoes);

   } catch (error){
    console.error("Erro ao buscar caravanas para notificações:", error)
    res.status(500).json({error: "Erro ao buscar caravanas para notificações." })
   }
})

app.get("/verificar-inscricao/:caravanaId/:usuarioId", async (req, res) => {
    const { caravanaId, usuarioId } = req.params;

    try {
        const inscricaoSnapshot = await db.collection("inscricoes")
            .where("caravanaId", "==", caravanaId)
            .where("usuarioId", "==", usuarioId)
            .get();

        res.status(200).json({ inscrito: !inscricaoSnapshot.empty });

    } catch (error) {
        console.error("Erro ao verificar inscrição:", error);
        res.status(500).json({ error: "Erro ao verificar inscrição." });
    }
});

app.get("/caravanas-canceladas", verificarAdmin, async (req, res) => {

    try {
        const caravanasSnapshot = await db.collection("caravanas")
              .where("status", "==", "cancelada")
              .get();
         const caravanas = [];
           for (const doc of caravanasSnapshot.docs) {
               caravanas.push({
                id: doc.id,
                ...doc.data()
               })
           }
            res.status(200).json(caravanas);
    } catch (error) {
        console.error("Erro ao buscar caravanas canceladas:", error);
        res.status(500).json({ error: "Erro interno ao buscar caravanas canceladas." });
    }
});

const getCaravanasUsuarioPorStatus = async (userId, status) => {
    try {
        console.log(`Buscando caravanas para userId: ${userId}, status: ${status}`);

        const participantesSnapshot = await db.collection('participantes')
            .where('uid', '==', userId)
            .get();

        console.log("participantesSnapshot.size:", participantesSnapshot.size);
        participantesSnapshot.forEach(doc => {
            console.log("  Participante:", doc.id, doc.data());
        });

        const caravanasIds = [];
        participantesSnapshot.forEach(doc => {
            const caravanaId = doc.data().caravanaId;
            if (!caravanasIds.includes(caravanaId)) {
                caravanasIds.push(caravanaId);
            }
        });

        console.log("caravanasIds:", caravanasIds);

        if (caravanasIds.length === 0) {
            console.log("Nenhuma caravana encontrada para o usuário.");
            return [];
        }

        let caravanasQuery = db.collection('caravanas')
            .where(firebaseAdmin.firestore.FieldPath.documentId(), 'in', caravanasIds);

        if (status) {
            caravanasQuery = caravanasQuery.where('status', '==', status);
        }

        const caravanasSnapshot = await caravanasQuery.get();

        console.log("caravanasSnapshot.size:", caravanasSnapshot.size);
        caravanasSnapshot.forEach(doc => {
            console.log("  Caravana:", doc.id, doc.data());
        });

        const caravanas = [];
        for (const doc of caravanasSnapshot.docs) {
            const caravana = doc.data();

            const localidadeDoc = await db.collection('localidades').doc(caravana.localidadeId).get();
            const localidadeData = localidadeDoc.exists ? {
                nomeLocalidade: localidadeDoc.data().nome,
                imagensLocalidade: localidadeDoc.data().imagens,
            } : {};

            const participantesCaravanaSnapshot = await db.collection('participantes')
                .where('caravanaId', '==', doc.id)
                .where('uid', '==', userId)
                .get();
            let quantidadeTotal = 0;

             participantesCaravanaSnapshot.forEach(partDoc => {
                quantidadeTotal += parseInt(partDoc.data().quantidade, 10) || 0;

             });

            caravanas.push({
                id: doc.id,
                ...caravana,
                ...localidadeData,
                quantidadeTotal,
            });
        }

        console.log("Caravanas encontradas (final):", caravanas);
        return caravanas;

    } catch (error) {
        console.error("Erro em getCaravanasUsuarioPorStatus (servidor):", error);
        throw error;
    }
};

app.get('/usuario/:userId/caravanas/confirmada', async (req, res) => {
        const { userId } = req.params;
        try {
            const caravanas = await getCaravanasUsuarioPorStatus(userId, 'confirmada');

            caravanas.sort((a, b) => new Date(a.data) - new Date(b.data));
            res.status(200).json(caravanas);
        } catch (error) {
            console.error("Erro ao buscar caravanas confirmadas do usuário:", error);
            res.status(500).json({ error: "Erro ao buscar caravanas confirmadas do usuário." });
        }
 });

app.get('/usuario/:userId/caravanas/nao_confirmada', async (req, res) => {
        const { userId } = req.params;
        try {
            const caravanas = await getCaravanasUsuarioPorStatus(userId, 'nao_confirmada');

             caravanas.sort((a, b) => new Date(a.data) - new Date(b.data));
            res.status(200).json(caravanas);
        } catch (error) {
            console.error("Erro ao buscar caravanas não confirmadas do usuário:", error);
            res.status(500).json({ error: "Erro ao buscar caravanas não confirmadas do usuário." });
        }
});

app.get('/usuario/:userId/caravanas/:status', verificarAutenticacao, async (req, res) => {
    const { userId, status } = req.params;
    try {
        console.log(`Chamando rota /usuario/${userId}/caravanas/${status}`);
        const caravanas = await getCaravanasUsuarioPorStatus(userId, status);
        console.log("Caravanas retornadas pela rota:", caravanas);
        res.status(200).json(caravanas);
    } catch (error) {
        console.error("Erro na rota /usuario/:userId/caravanas/:status:", error);
        res.status(500).json({ error: "Erro ao buscar caravanas do usuário." });
    }
});

app.get('/usuario/:userId/caravanas/canceladas', verificarAutenticacao, async (req, res) => {
    const {userId} = req.params
    try{
        console.log(`Chamando rota /usuario/${userId}/caravanas/canceladas`);
        const caravanas = await getCaravanasUsuarioPorStatus(userId, 'cancelada')
         console.log("Caravanas retornadas pela rota:", caravanas);
        res.status(200).json(caravanas)

    }catch(error) {
        console.error("Erro em /usuario/:userId/caravanas/canceladas:", error);
        res.status(500).json({ error: "Erro ao buscar caravanas do usuário." });
    }
})

const verificarCancelamentoAutomatico = async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const caravanasSnapshot = await db.collection('caravanas')
        .where('status', '==', 'nao_confirmada')
        .get();

    for (const doc of caravanasSnapshot.docs) {
        const caravana = doc.data();
        const dataCaravana = new Date(caravana.data);
        dataCaravana.setHours(0, 0, 0, 0);

        const dataLimite = new Date(dataCaravana);
        dataLimite.setDate(dataCaravana.getDate() - 14);

        if (hoje >= dataLimite && caravana.vagasDisponiveis > (caravana.vagasTotais - caravana.ocupacaoMinima)) {
            try {
                const localidadeDoc = await db.collection("localidades").doc(caravana.localidadeId).get();
                const nomeLocalidade = localidadeDoc.exists ? localidadeDoc.data().nome : caravana.localidadeId;

                const emails = await buscarUsuariosParaNotificacao(doc.id, 'cancelamento');

                await db.collection('caravanas').doc(doc.id).update({
                    status: 'cancelada',
                    motivoCancelamento: 'Não atingiu o número mínimo de participantes.',
                });

                const emailSubject = `Caravana para ${nomeLocalidade} Cancelada`;
                const emailHtml = `
                    <p>Olá!</p>
                    <p>Informamos que a caravana para ${nomeLocalidade} na data ${formatDate(caravana.data)} foi cancelada automaticamente por não atingir o número mínimo de participantes.</p>
                    <p>Entre em contato para mais informações sobre reembolso.</p>
                `;

                for (const emailObj of emails) {
                    await sendEmail(emailObj.email, emailSubject, emailHtml);
                }

                console.log(`Caravana ${doc.id} cancelada automaticamente e e-mails enviados.`);
            } catch (error) {
                console.error(`Erro ao cancelar caravana ${doc.id}:`, error);
            }
        }
    }
};

const enviarLembretes = async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const caravanasSnapshot = await db.collection('caravanas')
        .where('status', '==', 'confirmada')
        .get();

    for (const doc of caravanasSnapshot.docs) {
        const caravana = doc.data();
        const dataCaravana = new Date(caravana.data);
        dataCaravana.setHours(0, 0, 0, 0);

        const dataLembrete = new Date(dataCaravana);
        dataLembrete.setDate(dataCaravana.getDate() - 7);

        if (hoje.getTime() === dataLembrete.getTime()) {
            try {
                const localidadeDoc = await db.collection("localidades").doc(caravana.localidadeId).get();
                const nomeLocalidade = localidadeDoc.exists ? localidadeDoc.data().nome : caravana.localidadeId;

                const emails = await buscarUsuariosParaNotificacao(doc.id, 'lembrete');

                const emailSubject = `Lembrete: Caravana para ${nomeLocalidade} em breve!`;
                const emailHtml = `
                    <p>Olá!</p>
                    <p>Este é um lembrete da sua caravana para ${nomeLocalidade} no dia ${formatDate(caravana.data)}.</p>
                    <p>Horário de saída: ${caravana.horarioSaida || "A definir"}</p>
                    <p>Prepare-se para a viagem!</p>
                `;

                for (const emailObj of emails) {
                    await sendEmail(emailObj.email, emailSubject, emailHtml);
                }

                console.log(`Lembretes enviados para a caravana ${doc.id}.`);
            } catch (error) {
                console.error(`Erro ao enviar lembretes para a caravana ${doc.id}:`, error);
            }
        }
    }
};

cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Executando tarefa de verificação de cancelamento automático...');
    await verificarCancelamentoAutomatico();
});

cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Executando tarefa de envio de lembretes...');
    await enviarLembretes();
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta: ${PORT}`);
});
