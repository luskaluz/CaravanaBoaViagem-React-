import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import ModalCriarTransporte from '../modal/ModalCriarTransporte';
import ModalEditarTransporte from '../modal/ModalEditarTransporte';
import styles from './ListaTransporte.module.css';

const PLACEHOLDER_TRANSPORT_IMAGE = "https://via.placeholder.com/100x80?text=Transp";

function ListaTransportesAdmin() {
    const [transportes, setTransportes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [transporteParaEditar, setTransporteParaEditar] = useState(null);
    const [updatingQuantities, setUpdatingQuantities] = useState({});

    const carregarTransportes = async () => {
        setIsLoading(true); setError(null);
        try { const data = await api.getTransportes(); setTransportes(data); }
        catch (err) { setError(err.message); console.error(err); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { carregarTransportes(); }, []);

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza?")) {
            try { await api.deleteTransporte(id); carregarTransportes(); alert("Excluído!"); }
            catch (err) { setError(err.message); alert(`Erro: ${err.message}`); }
        }
    };

    const handleUpdateTotalQuantidade = async (id, novaQuantidadeTotal) => {
        if (novaQuantidadeTotal < 0) return;
        setUpdatingQuantities(prev => ({ ...prev, [id]: true }));
        try {
            await api.updateTransporteQuantidade(id, novaQuantidadeTotal);
            setTransportes(prev => prev.map(t =>
                t.id === id ? { ...t, quantidadeTotal: novaQuantidadeTotal, quantidadeDisponivel: novaQuantidadeTotal } : t
            ));
        } catch (err) { console.error(err); alert(`Erro: ${err.message}`); }
        finally { setUpdatingQuantities(prev => ({ ...prev, [id]: false })); }
    };

    const handleAbrirModalCriar = () => setShowCreateModal(true);
    const handleFecharModalCriar = () => setShowCreateModal(false);
    const handleAbrirModalEditar = (transporte) => { setTransporteParaEditar(transporte); setShowEditModal(true); };
    const handleFecharModalEditar = () => { setShowEditModal(false); setTransporteParaEditar(null); };
    const handleTransporteSalvo = () => { handleFecharModalCriar(); handleFecharModalEditar(); carregarTransportes(); };

    return (
        <div className={styles.container}>
             <div className={styles.header || ''}>
                <h2>Gerenciar Transportes</h2>
                <button onClick={handleAbrirModalCriar} className={styles.addButton}>Adicionar Transporte</button>
            </div>

             {isLoading && <div className={styles.loading}>Carregando...</div>}
             {error && <div className={styles.error}>Erro: {error}</div>}
             {!isLoading && !error && transportes.length === 0 && (<p>Nenhum transporte cadastrado.</p>)}

             {!isLoading && !error && transportes.length > 0 && (
                 <ul className={styles.list}>
                     {transportes.map((transp) => {
                        const totalAtual = transp.quantidadeTotal || 0;
                        const disponivelAtual = transp.quantidadeDisponivel ?? totalAtual; // Usa total se disponível não existir
                        return (
                         <li key={transp.id} className={styles.listItem}>
                             <div className={styles.imagemContainer}>
                                 <img src={transp.imagemUrl || PLACEHOLDER_TRANSPORT_IMAGE} alt={transp.nome} className={styles.miniatura} onError={(e)=>{ e.target.onerror = null; e.target.src=PLACEHOLDER_TRANSPORT_IMAGE; }}/>
                             </div>
                             <div className={styles.localidadeInfo}>
                                 <p><span className={styles.label}>Nome:</span> {transp.nome}</p>
                                 <p><span className={styles.label}>Fornecedor:</span> {transp.fornecedor || 'N/A'}</p>
                                 <p><span className={styles.label}>Assentos:</span> {transp.assentos}</p>
                                 <p><span className={styles.label}>Custo:</span> R$ {(transp.custoAluguel || 0).toFixed(2)}</p>
                                 <div className={styles.quantidadeContainer}>
                                     <span className={styles.label}>Qtd. Total:</span>
                                     <button onClick={() => handleUpdateTotalQuantidade(transp.id, totalAtual - 1)} disabled={updatingQuantities[transp.id] || totalAtual <= 0} className={styles.qtyButton}>-</button>
                                     <span className={styles.quantidadeValor}>{updatingQuantities[transp.id] ? '...' : totalAtual}</span>
                                     <button onClick={() => handleUpdateTotalQuantidade(transp.id, totalAtual + 1)} disabled={updatingQuantities[transp.id]} className={styles.qtyButton}>+</button>
                                 </div>
                                 <p className={styles.quantidadeDisponivel}><span className={styles.label}>Disponíveis:</span> {disponivelAtual}</p>
                             </div>
                             <div className={styles.buttonGroup}>
                                 <button onClick={() => handleAbrirModalEditar(transp)} className={styles.editButton}>Editar</button>
                                 <button onClick={() => handleDelete(transp.id)} className={styles.deleteButton}>Excluir</button>
                             </div>
                         </li>
                        );
                    })}
                 </ul>
             )}

            {showCreateModal && <ModalCriarTransporte onClose={handleFecharModalCriar} onSave={handleTransporteSalvo} />}
            {showEditModal && <ModalEditarTransporte transporte={transporteParaEditar} onClose={handleFecharModalEditar} onSave={handleTransporteSalvo} />}
        </div>
    );
}

export default ListaTransportesAdmin;