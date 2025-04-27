
import axios from 'axios';
import {auth} from './firebase'

const API_URL = 'http://localhost:5000';

const apiRequest = async (method, url, data = null, params = null) => {
    try {

        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;


        const config = {
            method,
            url: `${API_URL}${url}`,
            data: data ?? {},
            params,
            headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : null,
            },
        };

        console.log("Configuração da requisição:", config);
        const response = await axios(config);
        return response.data;

    } catch (error) {
        console.error("Erro na API:", error.response || error);
        const errorMessage = error.response?.data?.error || error.message || "Erro desconhecido na API";
        throw new Error(errorMessage);
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
export const getCaravanas = async (sortBy = null, status = null) => {
    const params = {};
    if (sortBy) params.sortBy = sortBy;
    if (status) params.status = status;
    return apiRequest('get', '/caravanas', null, params);
};
export const getCaravana = async (id) => apiRequest('get', `/caravanas/${id}`);
export const createCaravana = async (caravanaData) => apiRequest('post', '/caravanas', caravanaData);
export const updateCaravana = async (id, caravanaData) => apiRequest('put', `/caravanas/${id}`, caravanaData);
export const deleteCaravana = async (id) => apiRequest('delete', `/caravanas/${id}`);
export const comprarIngresso = async (caravanaId, usuarioId, usuarioEmail, quantidade) => {
    return apiRequest('post', '/comprar-ingresso', { caravanaId, usuarioId, usuarioEmail, quantidade });
};
export const getCaravanasPorStatus = async (status) => apiRequest('get', `/caravanas-por-status/${status}`);
export const getCaravanasCanceladas = async () => apiRequest('get', `/caravanas-canceladas`);
export const cancelCaravan = (id) => apiRequest('put', `/cancelar-caravana/${id}`);
export const getParticipantesCaravana = async (caravanaId) => apiRequest('get', `/participantes/${caravanaId}`);

// --- Usuários ---
export const registrarUsuario = async (uid, userData) => apiRequest('post', '/register', { uid, ...userData });
export const getDadosUsuario = async (uid) => apiRequest('get', `/user/${uid}`);
export const getCaravanasRegistradas = async (usuarioId) => apiRequest('get', `/caravanas-registradas/${usuarioId}`);
export const getCaravanasUsuarioPorStatus = async (userId, status) =>  apiRequest('get', `/usuario/${userId}/caravanas/${status}`);
export const getCaravanasCanceladasUsuario = async (userId) => apiRequest('get', `/usuario/${userId}/caravanas/canceladas`);
export const checkInscricao = async (caravanaId, usuarioId) => apiRequest('get', `/verificar-inscricao/${caravanaId}/${usuarioId}`);

export const getCaravanasUsuario = async (userId) => {
    return apiRequest('get', `/usuario/${userId}/caravanas`); 
  };

// --- Transporte ---
export const createTransporte = async (transporteData) => apiRequest('post', '/transportes', transporteData);
export const getTransportes = async () => apiRequest('get', '/transportes');
export const updateTransporte = async (id, transporteData) => apiRequest('put', `/transportes/${id}`, transporteData);
export const deleteTransporte = async (id) => apiRequest('delete', `/transportes/${id}`);
export const updateTransporteQuantidade = async (id, novaQuantidadeTotal) => apiRequest('put', `/transportes/${id}/quantidade`, { quantidade: novaQuantidadeTotal });
