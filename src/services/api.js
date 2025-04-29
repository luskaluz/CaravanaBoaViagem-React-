import axios from 'axios';
import { auth } from './firebase'; // Verifique o caminho

// Use variável de ambiente se possível, senão a string direta
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const apiRequest = async (method, url, data = null, params = null) => {
    try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const config = {
            method,
            url: `${API_URL}${url}`,
            // Envia 'data' apenas se não for null. GET/DELETE não devem ter corpo.
            ...(data && { data: data }),
            params, // Axios usa 'params' para query strings
            headers: {
                'Content-Type': 'application/json',
                // Inclui token apenas se existir
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            timeout: 10000, // 10 segundos de timeout
        };

        // console.log("API Request Config:", config); // Descomente para debug
        const response = await axios(config);
        return response.data;

    } catch (error) {
        console.error("Erro na API:", url, error.response?.status, error.response?.data || error.message);
        let errorMessage = "Erro desconhecido na API.";
        let statusCode = 500;

        if (error.response) {
            errorMessage = error.response.data?.error || error.response.data?.message || `Erro ${error.response.status}`;
            statusCode = error.response.status;
        } else if (error.request) {
            errorMessage = "Não foi possível conectar ao servidor.";
            statusCode = 503;
        } else {
            errorMessage = error.message;
        }

         const apiError = new Error(errorMessage);
         apiError.status = statusCode; // Adiciona status ao erro
         throw apiError; // Re-lança o erro customizado
    }
};


// --- Funcionários ---
export const createFuncionario = async (funcionarioData) => apiRequest('post', '/funcionarios', funcionarioData);
export const getFuncionarios = async () => apiRequest('get', '/funcionarios');
export const getFuncionarioById = async (uid) => apiRequest('get', `/funcionarios/${uid}`);
export const updateFuncionario = async (id, funcionarioData) => apiRequest('put', `/funcionarios/${id}`, funcionarioData);
export const deleteFuncionario = async (id) => apiRequest('delete', `/funcionarios/${id}`);
export const getCaravanasFuncionario = async (uid) => apiRequest('get', `/funcionarios/${uid}/caravanas`);

// --- Localidades ---
export const getLocalidades = async () => apiRequest('get', '/localidades');
export const createLocalidade = async (localidadeData) => apiRequest('post', '/localidades', localidadeData);
export const updateLocalidade = async (id, localidadeData) => apiRequest('put', `/localidades/${id}`, localidadeData);
export const deleteLocalidade = async (id) => apiRequest('delete', `/localidades/${id}`);
export const getDescricaoLocalidade = async (localidadeId) => apiRequest('get', `/localidades/${localidadeId}/descricao`);

// --- Caravanas ---
export const getCaravanas = async (params = null) => apiRequest('get', '/caravanas', null, params);
export const getCaravanaById = async (id) => apiRequest('get', `/caravanas/${id}`);
export const createCaravana = async (caravanaData) => apiRequest('post', '/caravanas', caravanaData);
export const updateCaravana = async (id, caravanaData) => apiRequest('put', `/caravanas/${id}`, caravanaData);
export const deleteCaravana = async (id) => apiRequest('delete', `/caravanas/${id}`);
export const comprarIngresso = async (caravanaId, quantidade) => apiRequest('post', '/comprar-ingresso', { caravanaId, quantidade });
export const cancelCaravan = (id, motivo = null) => apiRequest('put', `/cancelar-caravana/${id}`, { motivo });
export const getParticipantesCaravana = async (caravanaId) => apiRequest('get', `/participantes/${caravanaId}`);

// --- Transportes ---
export const createTransporte = async (transporteData) => apiRequest('post', '/transportes', transporteData);
export const getTransportes = async () => apiRequest('get', '/transportes');
export const updateTransporte = async (id, transporteData) => apiRequest('put', `/transportes/${id}`, transporteData);
export const deleteTransporte = async (id) => apiRequest('delete', `/transportes/${id}`);
export const updateTransporteDisponibilidade = async (id, novoEstado) => apiRequest('put', `/transportes/${id}/disponibilidade`, { disponivel: novoEstado });
export const updateAlocacaoManual = async (caravanaId, transportesIds) => apiRequest('put', `/caravanas/${caravanaId}/alocacao-manual`, { transportesSelecionadosIds: transportesIds });
export const definirTransportePlacaMotorista = async (caravanaId, transporteId, placa, motoristaUid = null) => apiRequest('put', `/caravanas/${caravanaId}/definir-placa-motorista`, { transporteId, placa, motoristaUid });

// --- Usuários ---
export const registrarUsuario = async (userData) => apiRequest('post', '/register', userData);
export const getDadosUsuario = async (uid) => apiRequest('get', `/user/${uid}`);
export const getCaravanasUsuarioPorStatus = async (userId, status) => apiRequest('get', `/usuario/${userId}/caravanas/${status}`);
export const getCaravanasUsuario = async (userId) => apiRequest('get', `/usuario/${userId}/caravanas`);

