import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api'; // Verifique o caminho
// Ajuste os imports dos Modais se você renomeou o FormularioTransporte
import ModalCriarTransporte from '../modal/ModalCriarTransporte'; // Ou ModalCriarTipoTransporte
import ModalEditarTransporte from '../modal/ModalEditarTransporte'; // Ou ModalEditarTipoTransporte
import styles from './ListaLocalidades.module.css'; // Verifique o caminho

// Placeholder para imagem do tipo de transporte
const PLACEHOLDER_TRANSPORT_IMAGE = "https://via.placeholder.com/100x80?text=Tipo";

// Renomeando para clareza, opcional
function ListaTiposTransporteAdmin() {
    // O estado ainda armazena a lista, mas agora são tipos
    const [transportes, setTransportes] = useState([]); // Pode manter o nome ou mudar para tiposTransporte
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    // O objeto para editar ainda é passado para o formulário
    const [transporteParaEditar, setTransporteParaEditar] = useState(null);
    const carregarTransportes = async () => { // Função para carregar os tipos
        setIsLoading(true); setError(null);
        try {
            const data = await api.getTransportes(); // A API GET /transportes agora retorna tipos
            setTransportes(data);
        }
        catch (err) { setError(err.message); console.error(err); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { carregarTransportes(); }, []);

    const handleDelete = async (id, nomeTipo) => { 
        if (window.confirm(`Tem certeza que deseja excluir o tipo de veículo "${nomeTipo}"?\n\n Se este tipo estiver alocado em caravanas futuras, a exclusão pode falhar ou causar problemas.`)) {
            try {

                 await api.deleteTransporte(id);
                 alert(`Tipo "${nomeTipo}" excluído com sucesso!`);
                 carregarTransportes(); // Recarrega a lista
            }
            catch (err) {
                 setError(err.message);
                 alert(`Erro ao excluir: ${err.message}`);
            }
        }
    };

    // Removida função handleToggleDisponibilidade

    // Funções de abrir/fechar modais (sem alterações)
    const handleAbrirModalCriar = () => setShowCreateModal(true);
    const handleFecharModalCriar = () => setShowCreateModal(false);
    const handleAbrirModalEditar = (transporte) => { setTransporteParaEditar(transporte); setShowEditModal(true); };
    const handleFecharModalEditar = () => { setShowEditModal(false); setTransporteParaEditar(null); };
    // Função de callback após salvar (sem alterações)
    const handleTransporteSalvo = () => { handleFecharModalCriar(); handleFecharModalEditar(); carregarTransportes(); };

    return (
        <div className={styles.container}>
             {/* Ajuste o título */}
             <div className={styles.header || ''}>
                <h2>Gerenciar Tipos de Veículo</h2>
                <button onClick={handleAbrirModalCriar} className={styles.addButton}>Adicionar Tipo</button>
            </div>
             {isLoading && <div className={styles.loading}>Carregando...</div>}
             {error && <div className={styles.error}>Erro: {error}</div>}
             {/* Ajuste a mensagem */}
             {!isLoading && !error && transportes.length === 0 && (<p>Nenhum tipo de veículo cadastrado.</p>)}
             {!isLoading && !error && transportes.length > 0 && (
                 <ul className={styles.list}>
                     {transportes.map((transp) => ( // transp agora representa um TIPO
                         <li key={transp.id} className={styles.listItem}>
                             <div className={styles.imagemContainer}>
                                 {/* Imagem do tipo */}
                                 <img src={transp.imagemUrl || PLACEHOLDER_TRANSPORT_IMAGE} alt={transp.nome} className={styles.miniatura} onError={(e)=>{ e.target.onerror = null; e.target.src=PLACEHOLDER_TRANSPORT_IMAGE; }}/>
                             </div>
                             <div className={styles.localidadeInfo}> {/* Reutilizando a classe, mas pode renomear */}
                                 <p><span className={styles.label}>Tipo:</span> {transp.nome}</p>
                                 {/* Fornecedor (se mantido) */}
                                 <p><span className={styles.label}>Fornecedor:</span> {transp.fornecedor || 'N/A'}</p>

                                 {/* PLACA REMOVIDA */}
                                 {/* <p><span className={styles.label}>Placa:</span> {transp.placa || 'N/A'}</p> */}

                                 <p><span className={styles.label}>Assentos:</span> {transp.assentos}</p>

                                  {/* CONTROLE DE DISPONIBILIDADE REMOVIDO */}
                                  {/*
                                  <div className={styles.disponibilidadeContainer}>
                                     <span className={styles.label}>Disponível:</span>
                                     <button onClick={() => handleToggleDisponibilidade(transp.id, transp.disponivel)} disabled={updatingAvailability[transp.id]} className={`${styles.toggleButton} ${transp.disponivel ? styles.toggleOn : styles.toggleOff}`} title={transp.disponivel ? 'Marcar Indisponível' : 'Marcar Disponível'}>
                                         {updatingAvailability[transp.id] ? '...' : (transp.disponivel ? 'Sim' : 'Não')}
                                     </button>
                                 </div>
                                 */}
                             </div>
                             <div className={styles.buttonGroup}>
                                 {/* Botão Editar continua funcionando */}
                                 <button onClick={() => handleAbrirModalEditar(transp)} className={styles.editButton}>Editar</button>
                                 {/* Botão Excluir chama a função atualizada */}
                                 <button onClick={() => handleDelete(transp.id, transp.nome)} className={styles.deleteButton}>Excluir</button>
                             </div>
                         </li>
                     ))}
                 </ul>
             )}
             {/* Os modais usarão o FormularioTipoTransporte atualizado */}
            {showCreateModal && <ModalCriarTransporte onClose={handleFecharModalCriar} onSave={handleTransporteSalvo} />}
            {showEditModal && <ModalEditarTransporte transporte={transporteParaEditar} onClose={handleFecharModalEditar} onSave={handleTransporteSalvo} />}
        </div>
    );
}

// Mude a exportação se renomeou o componente
export default ListaTiposTransporteAdmin; // ou ListaTransportesAdmin se não renomeou