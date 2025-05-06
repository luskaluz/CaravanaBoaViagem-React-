import axios from 'axios';
import { auth } from './firebase';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const apiRequest = async (method, url, data = null, params = null) => {
    try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const config = {
            method,
            url: `${API_URL}${url}`,
            ...(data && ['post', 'put', 'patch'].includes(method.toLowerCase()) && { data: data }),
            params,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            timeout: 60000,
        };
        const response = await axios(config);
        return response.data;

    } catch (error) {
        console.error(`Erro na API: ${method.toUpperCase()} ${url}`, error);

        let errorMessage = "Ocorreu um erro desconhecido na comunicação com o servidor.";
        let statusCode = 500;
        let errorData = null;

        if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
             errorMessage = `Tempo limite (${(error.config?.timeout || 0) / 1000}s) excedido ao tentar acessar a rota ${url}. O servidor pode estar lento ou indisponível.`;
             statusCode = 408;
        } else if (error.response) {
            errorData = error.response.data;
            // Tenta pegar a mensagem de erro do backend, senão usa uma genérica
            errorMessage = errorData?.error || errorData?.message || `Erro ${error.response.status} ao processar sua requisição.`;
            statusCode = error.response.status;
            console.error("Detalhes do erro da API:", errorData);
        } else if (error.request) {
            errorMessage = "Não foi possível conectar ao servidor. Verifique sua conexão ou o status do servidor.";
            statusCode = 503;
        } else if (error.message) { // Erro ao configurar a requisição ou outro erro JS
            errorMessage = error.message;
        }

         const apiError = new Error(errorMessage); // <<< GARANTE QUE É UM OBJETO Error
         apiError.status = statusCode;
         apiError.data = errorData;
         apiError.config = error.config;
         throw apiError; // <<< Relança o objeto Error
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
export const getParticipantesDistribuidos = async (caravanaId, params = null) => {return apiRequest('get', `/caravanas/${caravanaId}/participantes-distribuidos`, null, params);};
export const confirmarCaravanaManual = async (caravanaId) => { apiRequest('put', `/caravanas/${caravanaId}/confirmar-manual`);};
    
// --- Transportes ---
export const createTransporte = async (transporteData) => apiRequest('post', '/transportes', transporteData);
export const getTransportes = async () => apiRequest('get', '/transportes');
export const updateTransporte = async (id, transporteData) => apiRequest('put', `/transportes/${id}`, transporteData);
export const deleteTransporte = async (id) => apiRequest('delete', `/transportes/${id}`);
export const updateTransporteDisponibilidade = async (id, novoEstado) => apiRequest('put', `/transportes/${id}/disponibilidade`, { disponivel: novoEstado });
export const updateAlocacaoManual = async (caravanaId, transportesIds) => apiRequest('put', `/caravanas/${caravanaId}/alocacao-manual`, { transportesSelecionadosIds: transportesIds });
export const definirTransportePlacaMotorista = async (caravanaId, transporteId, placa, motoristaUid = null) => apiRequest('put', `/caravanas/${caravanaId}/definir-placa-motorista`, { transporteId, placa, motoristaUid });
export const definirTransporteFinal = async (caravanaId, data) => {
    return apiRequest('put', `/caravanas/${caravanaId}/definir-transporte-final`, data);
};


// --- Usuários ---
export const registrarUsuario = async (userData) => apiRequest('post', '/register', userData);
export const getDadosUsuario = async (uid) => apiRequest('get', `/user/${uid}`);
export const getCaravanasUsuarioPorStatus = async (userId, status) => apiRequest('get', `/usuario/${userId}/caravanas/${status}`);
export const getCaravanasUsuario = async (userId) => apiRequest('get', `/usuario/${userId}/caravanas`);

