import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import ModalCriarTransporte from '../modal/ModalCriarTransporte';
import ModalEditarTransporte from '../modal/ModalEditarTransporte';
import styles from './ListaLocalidades.module.css'; // Pode precisar de um CSS específico
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importa Spinner

const PLACEHOLDER_TRANSPORT_IMAGE = "https://via.placeholder.com/100x80?text=Tipo";

function ListaTiposTransporteAdmin() {
    const [transportes, setTransportes] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // Inicia true
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [transporteParaEditar, setTransporteParaEditar] = useState(null);

    const carregarTransportes = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getTransportes();
            setTransportes(data);
        }
        catch (err) {
            setError(err.message || "Erro desconhecido ao buscar tipos.");
            console.error("Erro ao buscar tipos de transporte:", err);
        }
        finally { setIsLoading(false); }
    };

    useEffect(() => { carregarTransportes(); }, []);

    const handleDelete = async (id, nomeTipo) => {
        if (window.confirm(`Excluir tipo "${nomeTipo}"? Verifique se não está em uso.`)) {
            // Opcional: loading específico
            try {
                 await api.deleteTransporte(id);
                 alert(`Tipo "${nomeTipo}" excluído!`);
                 carregarTransportes();
            }
            catch (err) {
                 setError(err.message);
                 alert(`Erro ao excluir: ${err.message}`);
            } finally { /* parar loading */ }
        }
    };

    const handleAbrirModalCriar = () => setShowCreateModal(true);
    const handleFecharModalCriar = () => setShowCreateModal(false);
    const handleAbrirModalEditar = (transporte) => { setTransporteParaEditar(transporte); setShowEditModal(true); };
    const handleFecharModalEditar = () => { setShowEditModal(false); setTransporteParaEditar(null); };
    const handleTransporteSalvo = () => { handleFecharModalCriar(); handleFecharModalEditar(); carregarTransportes(); };

    const renderContent = () => {
        if (isLoading) return <LoadingSpinner mensagem="Carregando tipos..." />;
        if (error) return <div className={styles.error}>Erro ao carregar tipos: {error}</div>;
        if (transportes.length === 0) return <p>Nenhum tipo de veículo cadastrado.</p>;

        return (
            <ul className={styles.list}>
                {transportes.map((transp) => (
                    <li key={transp.id} className={styles.listItem}>
                        <div className={styles.imagemContainer}>
                            <img src={transp.imagemUrl || PLACEHOLDER_TRANSPORT_IMAGE} alt={transp.nome} className={styles.miniatura} onError={(e)=>{ e.target.onerror = null; e.target.src=PLACEHOLDER_TRANSPORT_IMAGE; }}/>
                        </div>
                        <div className={styles.localidadeInfo}>
                            <p><span className={styles.label}>Tipo:</span> {transp.nome}</p>
                            <p><span className={styles.label}>Fornecedor:</span> {transp.fornecedor || 'N/A'}</p>
                            <p><span className={styles.label}>Assentos:</span> {transp.assentos}</p>
                        </div>
                        <div className={styles.buttonGroup}>
                            <button className={styles.editButton} onClick={() => handleAbrirModalEditar(transp)}>Editar</button>
                            <button className={styles.deleteButton} onClick={() => handleDelete(transp.id, transp.nome)}>Excluir</button>
                        </div>
                    </li>
                ))}
            </ul>
        );
    }


    return (
        <div className={styles.container}>
             <div className={styles.header}>
                <h2>Gerenciar Tipos de Veículo</h2>
                <button onClick={handleAbrirModalCriar} className={styles.addButton} disabled={isLoading}>Adicionar Tipo</button>
            </div>

            {renderContent()}

            {showCreateModal && <ModalCriarTransporte onClose={handleFecharModalCriar} onSave={handleTransporteSalvo} />}
            {showEditModal && transporteParaEditar && <ModalEditarTransporte transporte={transporteParaEditar} onClose={handleFecharModalEditar} onSave={handleTransporteSalvo} />}
        </div>
    );
}

export default ListaTiposTransporteAdmin;