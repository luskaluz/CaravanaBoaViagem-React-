import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import ModalCriarTransporte from '../modal/ModalCriarTransporte';
import ModalEditarTransporte from '../modal/ModalEditarTransporte';
import styles from './ListaLocalidades.module.css'; // Continua usando o estilo de localidades

const PLACEHOLDER_TRANSPORT_IMAGE = "https://via.placeholder.com/100x80?text=Transp";

function ListaTransportesAdmin() {
    const [transportes, setTransportes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [transporteParaEditar, setTransporteParaEditar] = useState(null);
    const [updatingAvailability, setUpdatingAvailability] = useState({});

    const carregarTransportes = async () => {
        setIsLoading(true); setError(null);
        try { const data = await api.getTransportes(); setTransportes(data); }
        catch (err) { setError(err.message); console.error(err); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { carregarTransportes(); }, []);

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir este veículo?")) {
            try {
                 // Adicionar verificação no backend é mais seguro, mas uma checagem rápida aqui pode ajudar
                 const veiculo = transportes.find(t => t.id === id);
                 if (veiculo && !veiculo.disponivel) {
                      alert("Não é possível excluir um veículo que está alocado (não disponível). Libere-o primeiro.");
                      return;
                 }
                 await api.deleteTransporte(id);
                 carregarTransportes();
                 alert("Excluído!");
            }
            catch (err) { setError(err.message); alert(`Erro: ${err.message}`); }
        }
    };

    const handleAbrirModalCriar = () => setShowCreateModal(true);
    const handleFecharModalCriar = () => setShowCreateModal(false);
    const handleAbrirModalEditar = (transporte) => { setTransporteParaEditar(transporte); setShowEditModal(true); };
    const handleFecharModalEditar = () => { setShowEditModal(false); setTransporteParaEditar(null); };
    const handleTransporteSalvo = () => { handleFecharModalCriar(); handleFecharModalEditar(); carregarTransportes(); };


    return (
        <div className={styles.container}>
             <div className={styles.header || ''}>
                <h2>Gerenciar Frota</h2>
                <button onClick={handleAbrirModalCriar} className={styles.addButton}>Adicionar Veículo</button>
            </div>
             {isLoading && <div className={styles.loading}>Carregando...</div>}
             {error && <div className={styles.error}>Erro: {error}</div>}
             {!isLoading && !error && transportes.length === 0 && (<p>Nenhum veículo cadastrado.</p>)}
             {!isLoading && !error && transportes.length > 0 && (
                 <ul className={styles.list}>
                     {transportes.map((transp) => (
                         <li key={transp.id} className={styles.listItem}>
                             <div className={styles.imagemContainer}>
                                 <img src={transp.imagemUrl || PLACEHOLDER_TRANSPORT_IMAGE} alt={transp.nome} className={styles.miniatura} onError={(e)=>{ e.target.onerror = null; e.target.src=PLACEHOLDER_TRANSPORT_IMAGE; }}/>
                             </div>
                             <div className={styles.localidadeInfo}>
                                 <p><span className={styles.label}>Nome:</span> {transp.nome}</p>
                                 <p><span className={styles.label}>Fornecedor:</span> {transp.fornecedor || 'N/A'}</p>
                                 <p><span className={styles.label}>Assentos:</span> {transp.assentos}</p>

                             </div>
                             <div className={styles.buttonGroup}>
                                 <button onClick={() => handleAbrirModalEditar(transp)} className={styles.editButton}>Editar</button>
                                 <button onClick={() => handleDelete(transp.id)} className={styles.deleteButton}>Excluir</button>
                             </div>
                         </li>
                     ))}
                 </ul>
             )}
            {showCreateModal && <ModalCriarTransporte onClose={handleFecharModalCriar} onSave={handleTransporteSalvo} />}
            {showEditModal && <ModalEditarTransporte transporte={transporteParaEditar} onClose={handleFecharModalEditar} onSave={handleTransporteSalvo} />}
        </div>
    );
}

export default ListaTransportesAdmin;