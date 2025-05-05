import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaCaravana.module.css';
import ModalDetalhesCaravana from '../modal/ModalDetalhesCaravana';
import Participantes from '../modal/Participantes';
import FormularioCaravana from '../formularios/FormularioCaravana';
import CaravanaCard from '../../CaravanaCard/CaravanaCard';
import ModalDefinirTransporte from '../modal/ModalDefinirTransporte';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Ajuste o caminho

function ListaCaravanasAdmin({ caravanas: propCaravanas, onEditar }) { // Removido onCaravanaClick se não usado
    const [caravanas, setCaravanas] = useState(propCaravanas || []);
    const [isLoading, setIsLoading] = useState(!propCaravanas); // Inicia true se não receber props
    const [error, setError] = useState(null);
    const [status, setStatus] = useState(null);
    const [sortBy, setSortBy] = useState('data');
    const [showSubmenu, setShowSubmenu] = useState(false);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [modalParticipantes, setModalParticipantes] = useState(null);
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [caravanaParaEditar, setCaravanaParaEditar] = useState(null);
    const [showModalDefinirTransporte, setShowModalDefinirTransporte] = useState(false);
    const [caravanaParaDefinirTransporte, setCaravanaParaDefinirTransporte] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [cancelingId, setCancelingId] = useState(null);

    const sortByData = (a, b) => {
        const now = new Date(); now.setUTCHours(0, 0, 0, 0);
        const dateA = new Date(a.data + 'T00:00:00Z');
        const dateB = new Date(b.data + 'T00:00:00Z');
        const isPastA = dateA < now; const isPastB = dateB < now;
        const statusOrder = { 'confirmada': 1, 'nao_confirmada': 2, 'concluida': 3, 'cancelada': 4 };
        const statusA = statusOrder[a.status] || 5; const statusB = statusOrder[b.status] || 5;
        if (statusA !== statusB) return statusA - statusB;
        if (!isPastA && !isPastB) return dateA - dateB;
        if (isPastA && isPastB) return dateB - dateA;
        return isPastA ? 1 : -1;
    };

    const sortByOcupacao = (a, b) => {
        const getCapacidade = (c) => c.transporteDefinidoManualmente ? (c.capacidadeFinalizada || 0) : (c.transporteAutoDefinido ? (c.capacidadeFinalizada || 0) : (c.capacidadeMaximaTeorica || 0));
        const capA = getCapacidade(a); const capB = getCapacidade(b);
        const ocupA = capA > 0 ? ((a.vagasOcupadas || 0) / capA) * 100 : 0;
        const ocupB = capB > 0 ? ((b.vagasOcupadas || 0) / capB) * 100 : 0;
        if(ocupB !== ocupA) return ocupB - ocupA;
        return sortByData(a, b); // Desempate por data
    };

    const sortByLucroAtual = (a, b) => {
        const getLucro = (c) => (((c.vagasOcupadas || 0) * (c.preco || 0)) - (c.despesas || 0));
        const lucroA = getLucro(a); const lucroB = getLucro(b);
        if(lucroB !== lucroA) return lucroB - lucroA;
        return sortByData(a, b); // Desempate por data
    };

    const loadCaravanas = async () => {
        // Só busca se não recebeu via props ou se filtros/sort mudaram
        if(propCaravanas && !status && sortBy === 'data') {
            setCaravanas(propCaravanas); // Usa props se disponíveis e sem filtro/sort complexo
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            let data = propCaravanas ? [...propCaravanas] : await api.getCaravanas();
            let filteredData = status ? data.filter(c => c.status === status) : [...data];
            let processedData = [...filteredData];

            if (sortBy === 'data') processedData.sort(sortByData);
            else if (sortBy === 'ocupacao') processedData.sort(sortByOcupacao);
            else if (sortBy === 'lucroAtual') processedData.sort(sortByLucroAtual);

            setCaravanas(processedData);
        } catch (error) { setError(error.message); console.error("Erro Caravanas", error); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        loadCaravanas();
    }, [status, sortBy, propCaravanas]); // Executa quando filtros, sort ou props mudam

    const handleStatusChange = (newStatus) => { setStatus(newStatus === status ? null : newStatus); };
    const handleSortChange = (newSortBy) => { setSortBy(newSortBy); };
    const toggleSubmenu = () => { setShowSubmenu(!showSubmenu); };

    const handleCancelarCaravana = async (id) => {
        if (!window.confirm("Cancelar caravana?")) return;
        setCancelingId(id); setError(null);
        try { await api.cancelCaravan(id); loadCaravanas(); alert('Cancelada!'); }
        catch (error) { setError(error.message); alert(`Erro: ${error.message}`); }
        finally { setCancelingId(null); }
    };

    const handleDeletar = async (id) => {
        if (!window.confirm("Excluir PERMANENTEMENTE?")) return;
        setDeletingId(id); setError(null);
        try { await api.deleteCaravana(id); loadCaravanas(); alert('Excluída!'); }
        catch (error) { setError(error.message); alert(`Erro: ${error.message}`); }
        finally { setDeletingId(null); }
    };

    const handleEdit = (caravana) => { setCaravanaParaEditar(caravana); setShowModalEditar(true); };
    const closeModalEditar = () => { setShowModalEditar(false); setCaravanaParaEditar(null); };
    const handleCaravanaSalva = () => { closeModalEditar(); loadCaravanas(); };

    const openModalDetalhes = (caravana) => { setModalDetalhes(caravana); };
    const closeModalDetalhes = () => { setModalDetalhes(null); };
    const openModalParticipantes = (caravanaId) => { setModalParticipantes(caravanaId); };
    const closeModalParticipantes = () => { setModalParticipantes(null); };
    const openModalDefinirTransporte = (caravana) => { setCaravanaParaDefinirTransporte(caravana); setShowModalDefinirTransporte(true); };
    const closeModalDefinirTransporte = () => { setCaravanaParaDefinirTransporte(null); setShowModalDefinirTransporte(false); };
    const handleTransporteDefinido = () => { closeModalDefinirTransporte(); loadCaravanas(); alert('Transporte definido!'); };

    // --- Renderização Principal ---
    return (
        <div className={styles.container}>
            <h2 className={styles.titulo}>Lista de Caravanas</h2>
            <div className={styles.menuContainer}>
                <button className={styles.menuButton} onClick={toggleSubmenu}> Filtros e Ordenação {showSubmenu ? "▲" : "▼"} </button>
                {showSubmenu && ( <div className={styles.submenu}> {/* ... filtros e ordenação ... */} </div> )}
            </div>

            {/* --- Exibição de Loading, Erro ou Conteúdo --- */}
            {isLoading ? (
                <LoadingSpinner text="Carregando caravanas..." size="large" />
            ) : error ? (
                <div className={styles.error}>Erro ao carregar: {error}</div>
            ) : caravanas.length === 0 ? (
                <p>Nenhuma caravana encontrada com os filtros atuais.</p>
            ) : (
                 <div className={styles.cardContainer}>
                    {caravanas.map((caravana) => {
                        const isCanceling = cancelingId === caravana.id;
                        const isDeleting = deletingId === caravana.id;
                        const isBusy = isCanceling || isDeleting;
                        return (
                            <CaravanaCard key={caravana.id} caravana={caravana} isAdmin={true}>
                                 {/* ... adminInfo ... */}
                                <div className={styles.buttonRow}>
                                    <button className={styles.editButton} onClick={(e) => { e.stopPropagation(); handleEdit(caravana); }} disabled={isBusy}>Editar Dados</button>
                                    <button className={styles.detailsButton} onClick={(e)=>{ e.stopPropagation(); openModalDetalhes(caravana); }} disabled={isBusy}>+ Detalhes</button>
                                    <button className={styles.participantsButton} onClick={(e)=>{ e.stopPropagation(); openModalParticipantes(caravana.id); }} disabled={isBusy}>Participantes ({caravana.vagasOcupadas || 0})</button>
                                </div>
                                <div className={styles.buttonRow}>
                                    {caravana.status !== 'cancelada' && caravana.status !== 'concluida' &&(
                                        <button className={styles.cancelButton} onClick={(e)=>{ e.stopPropagation(); handleCancelarCaravana(caravana.id); }} disabled={isBusy}>
                                            {isCanceling ? <LoadingSpinner size="small" inline={true} /> : 'Cancelar'}
                                        </button>
                                    )}
                                    <button className={styles.deleteButton} onClick={(e)=>{ e.stopPropagation(); handleDeletar(caravana.id); }} disabled={isBusy}>
                                        {isDeleting ? <LoadingSpinner size="small" inline={true} /> : 'Excluir'}
                                    </button>
                                    <button className={`${styles.button} ${styles.transportButton}`} onClick={(e)=>{ e.stopPropagation(); openModalDefinirTransporte(caravana); }} disabled={isBusy}>
                                        Definir Transporte
                                    </button>
                                </div>
                            </CaravanaCard>
                        );
                     })}
                </div>
             )}

            {/* --- Modais --- */}
            {showModalEditar && ( <div className={styles.modalOverlay} onClick={closeModalEditar}> <div className={`${styles.modal} ${styles.modalForm}`} onClick={(e) => e.stopPropagation()}> <button className={styles.closeButton} onClick={closeModalEditar}>×</button> <FormularioCaravana caravana={caravanaParaEditar} onSalvar={handleCaravanaSalva} onCancelar={closeModalEditar} /> </div> </div> )}
            {modalDetalhes && ( <ModalDetalhesCaravana caravana={modalDetalhes} onClose={closeModalDetalhes} /> )}
            {modalParticipantes && ( <div className={styles.modalOverlay} onClick={closeModalParticipantes}> <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}> <button className={styles.closeButton} onClick={closeModalParticipantes}>×</button> <Participantes caravanaId={modalParticipantes} /> </div> </div> )}
            {showModalDefinirTransporte && caravanaParaDefinirTransporte && ( <ModalDefinirTransporte caravana={caravanaParaDefinirTransporte} onClose={closeModalDefinirTransporte} onSave={handleTransporteDefinido} /> )}
        </div>
    );
}

export default ListaCaravanasAdmin;