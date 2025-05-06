import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaCaravana.module.css';
import ModalDetalhesCaravana from '../modal/ModalDetalhesCaravana';
import Participantes from '../modal/Participantes';
import FormularioCaravana from '../formularios/FormularioCaravana';
import CaravanaCard from '../../CaravanaCard/CaravanaCard';
import ModalDefinirTransporte from '../modal/ModalDefinirTransporte';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importa Spinner

function ListaCaravanasAdmin({ caravanas: propCaravanas, onCaravanaClick }) {
    const [caravanas, setCaravanas] = useState(propCaravanas || []);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Inicia true
    const [status, setStatus] = useState(null);
    const [sortBy, setSortBy] = useState('data');
    const [showSubmenu, setShowSubmenu] = useState(false);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [modalParticipantes, setModalParticipantes] = useState(null);
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [caravanaParaEditar, setCaravanaParaEditar] = useState(null);
    const [showModalDefinirTransporte, setShowModalDefinirTransporte] = useState(false);
    const [caravanaParaDefinirTransporte, setCaravanaParaDefinirTransporte] = useState(null);

    const sortByData = (a, b) => {
        const now = new Date(); now.setUTCHours(0, 0, 0, 0);
        const dateA = new Date(a.data + 'T00:00:00Z'); const dateB = new Date(b.data + 'T00:00:00Z');
        const isPastA = dateA < now; const isPastB = dateB < now;
        const statusOrder = { 'confirmada': 1, 'nao_confirmada': 2, 'concluida': 3, 'cancelada': 4 };
        const statusA = statusOrder[a.status] || 5; const statusB = statusOrder[b.status] || 5;
        if (statusA !== statusB) return statusA - statusB;
        if (!isPastA && !isPastB) return dateA - dateB;
        if (isPastA && isPastB) return dateB - dateA;
        return isPastA ? 1 : -1;
    };

    const calcularOcupacaoPercent = (c) => {
        const capacidade = c.transporteDefinidoManualmente ? (c.capacidadeFinalizada || 0) : (c.transporteAutoDefinido ? (c.capacidadeFinalizada || 0) : (c.capacidadeMaximaTeorica || 0));
        if (capacidade <= 0) return 0;
        let numAdmins = 0;
        if ((c.transporteDefinidoManualmente || c.transporteAutoDefinido) && Array.isArray(c.transportesFinalizados)) {
            numAdmins = Math.min(capacidade, c.transportesFinalizados.length);
        } else {
            numAdmins = Math.min(capacidade, c.maximoTransportes || 0);
        }
        const totalOcupado = (c.vagasOcupadas || 0) + numAdmins;
        return (totalOcupado / capacidade) * 100;
    }

    const sortByOcupacao = (a, b) => {
        const ocupacaoA = calcularOcupacaoPercent(a);
        const ocupacaoB = calcularOcupacaoPercent(b);
        if(ocupacaoB !== ocupacaoA) return ocupacaoB - ocupacaoA;
        return sortByData(a,b); // Desempate por data
    };

    const sortByLucroAtual = (a, b) => {
        const lucroA = ((a.vagasOcupadas || 0) * (a.preco || 0)) - (a.despesas || 0);
        const lucroB = ((b.vagasOcupadas || 0) * (b.preco || 0)) - (b.despesas || 0);
         if(lucroB !== lucroA) return lucroB - lucroA;
         return sortByData(a,b); // Desempate por data
    };

    const loadCaravanas = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let data = propCaravanas ? [...propCaravanas] : await api.getCaravanas();
            let filteredData = status ? data.filter(c => c.status === status) : [...data];
            let processedData = [...filteredData];

            if (sortBy === 'data') processedData.sort(sortByData);
            else if (sortBy === 'ocupacao') processedData.sort(sortByOcupacao);
            else if (sortBy === 'lucroAtual') processedData.sort(sortByLucroAtual);
            // Outras ordenações (ex: preço) são feitas via query no backend

            setCaravanas(processedData);
        } catch (error) {
            setError(error.message || "Erro desconhecido");
            console.error("Erro ao buscar/processar Caravanas", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCaravanas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, sortBy, propCaravanas]);

    const handleStatusChange = (newStatus) => { setStatus(newStatus === status ? null : newStatus); };
    const handleSortChange = (newSortBy) => { setSortBy(newSortBy); };
    const toggleSubmenu = () => { setShowSubmenu(!showSubmenu); };

    const handleCancelarCaravana = async (id) => {
        if (!window.confirm("Cancelar esta caravana?")) return;
        // Opcional: setar loading específico
        try {
            await api.cancelCaravan(id);
            loadCaravanas(); // Recarrega
            alert('Caravana cancelada!');
        } catch (error) { setError(error.message); alert(`Erro: ${error.message}`); }
        finally { /* parar loading específico */ }
    };

    const handleDeletar = async (id) => {
        if (!window.confirm("EXCLUIR esta caravana PERMANENTEMENTE?")) return;
        try {
            await api.deleteCaravana(id);
            loadCaravanas();
            alert('Caravana excluída!');
        } catch (error) { setError(error.message); alert(`Erro: ${error.message}`); }
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

    const renderContent = () => {
        if (isLoading) return <LoadingSpinner mensagem="Carregando caravanas..." />;
        if (error) return <div className={styles.error}>Erro ao carregar caravanas: {error}</div>;
        if (caravanas.length === 0) return <p>Nenhuma caravana encontrada com os filtros atuais.</p>;

        return (
            <div className={styles.cardContainer}>
               {caravanas.map((caravana) => (
                   <CaravanaCard key={caravana.id} caravana={caravana} isAdmin={true}>
                       <div className={styles.adminInfo}>
                           {/* A info de ocupação agora vem do CaravanaCard */}
                           {caravana.guiaUid && <p><span className={styles.label}>Guia:</span> {caravana.guia?.nome || '...'}</p>}
                       </div>
                       <div className={styles.buttonRow}>
                           <button className={styles.editButton} onClick={(e) => { e.stopPropagation(); handleEdit(caravana); }}>Editar Dados</button>
                           <button className={styles.detailsButton} onClick={(e)=>{ e.stopPropagation(); openModalDetalhes(caravana); }}>Mais Detalhes</button>
                           <button className={styles.participantsButton} onClick={(e)=>{ e.stopPropagation(); openModalParticipantes(caravana.id); }}>Participantes ({caravana.vagasOcupadas || 0})</button>
                       </div>
                       <div className={styles.buttonRow}>
                           {caravana.status !== 'cancelada' && caravana.status !== 'concluida' &&( <button className={styles.cancelButton} onClick={(e)=>{ e.stopPropagation(); handleCancelarCaravana(caravana.id); }}>Cancelar</button> )}
                           <button className={styles.deleteButton} onClick={(e)=>{ e.stopPropagation(); handleDeletar(caravana.id); }}>Excluir</button>
                           <button className={`${styles.button} ${styles.transportButton}`} onClick={(e)=>{ e.stopPropagation(); openModalDefinirTransporte(caravana); }}>Definir Transporte</button>
                       </div>
                   </CaravanaCard>
               ))}
           </div>
        );
    }


    return (
        <div className={styles.container}>
            <h2 className={styles.titulo}>Lista de Caravanas</h2>
            <div className={styles.menuContainer}>
                <button className={styles.menuButton} onClick={toggleSubmenu}> Filtros e Ordenação {showSubmenu ? "▲" : "▼"} </button>
                {showSubmenu && (
                     <div className={styles.submenu}>
                         <div className={styles.submenuSection}>
                             <h3>Filtrar por Status:</h3>
                             <button className={status === null ? styles.activeButton : styles.button} onClick={() => handleStatusChange(null)}>Todas</button>
                             <button className={status === 'confirmada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('confirmada')}>Confirmadas</button>
                             <button className={status === 'nao_confirmada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('nao_confirmada')}>Não Confirmadas</button>
                             <button className={status === 'cancelada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('cancelada')}>Canceladas</button>
                             <button className={status === 'concluida' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('concluida')}>Concluídas</button>
                         </div>
                         <div className={styles.submenuSection}>
                             <h3>Ordenar por:</h3>
                             <button className={sortBy === 'data' ? styles.activeButton : styles.button} onClick={() => handleSortChange('data')}>Data</button>
                             <button className={sortBy === 'ocupacao' ? styles.activeButton : styles.button} onClick={() => handleSortChange('ocupacao')}>Ocupação (%)</button>
                             <button className={sortBy === 'lucroAtual' ? styles.activeButton : styles.button} onClick={() => handleSortChange('lucroAtual')}>Lucro Atual</button>
                         </div>
                     </div>
                 )}
            </div>

             {renderContent()}

            {showModalEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={`${styles.modal} ${styles.modalForm}`} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}></button>
                        <FormularioCaravana caravana={caravanaParaEditar} onSalvar={handleCaravanaSalva} onCancelar={closeModalEditar} />
                    </div>
                </div>
            )}
            {modalDetalhes && ( <ModalDetalhesCaravana caravana={modalDetalhes} onClose={closeModalDetalhes} /> )}
            {modalParticipantes && (
                <div className={styles.modalOverlay} onClick={closeModalParticipantes}>
                    <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalParticipantes}></button>
                        <Participantes caravanaId={modalParticipantes} />
                    </div>
                </div>
            )}
            {showModalDefinirTransporte && caravanaParaDefinirTransporte && (
                 <ModalDefinirTransporte caravana={caravanaParaDefinirTransporte} onClose={closeModalDefinirTransporte} onSave={handleTransporteDefinido} />
            )}
        </div>
    );
}

export default ListaCaravanasAdmin;