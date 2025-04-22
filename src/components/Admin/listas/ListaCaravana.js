import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaCaravana.module.css';
import ModalDetalhesCaravana from '../modal/ModalDetalhesCaravana';
import Participantes from '../modal/Participantes';
import { useNavigate } from 'react-router-dom';
import FormularioCaravana from '../formularios/FormularioCaravana';
import CaravanaCard from '../../CaravanaCard/CaravanaCard';

function ListaCaravanasAdmin({ caravanas: propCaravanas, onCaravanaClick }) {
    const [caravanas, setCaravanas] = useState(propCaravanas || []);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [sortBy, setSortBy] = useState('data');
    const [showSubmenu, setShowSubmenu] = useState(false);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [modalParticipantes, setModalParticipantes] = useState(null);
    const navigate = useNavigate();
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [caravanaParaEditar, setCaravanaParaEditar] = useState(null);


    const sortByData = (a, b) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const dateA = new Date(a.data);
        const dateB = new Date(b.data);
        dateA.setHours(0, 0, 0, 0)
        dateB.setHours(0, 0, 0, 0)
        const isPastA = dateA < now;
        const isPastB = dateB < now;
        const statusOrder = { 'confirmada': 1, 'nao_confirmada': 2, 'concluida': 3, 'cancelada': 4 };
        const statusA = statusOrder[a.status] || 4;
        const statusB = statusOrder[b.status] || 4;
        if (statusA !== statusB) { return statusA - statusB; }
        if (!isPastA && !isPastB) { return dateA - dateB }
        if (isPastA && isPastB) { return dateB - dateA }
        return isPastA ? 1 : -1;
    };

    const sortByOcupacao = (a, b) => {
        const ocupacaoA = Number(a.ocupacao ? a.ocupacao() : 0);
        const ocupacaoB = Number(b.ocupacao ? b.ocupacao() : 0);
        return ocupacaoB - ocupacaoA;
    };

    const sortByLucroAtual = (a, b) => {
        const lucroA = Number(a.lucroAtual ? a.lucroAtual() : 0);
        const lucroB = Number(b.lucroAtual ? b.lucroAtual() : 0);
        return lucroB - lucroA;
    };

    const loadCaravanas = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let data;
            if (!propCaravanas) {
                data = await api.getCaravanas();
            } else {
                data = [...propCaravanas];
            }

            let filteredData = status ? data.filter(c => c.status === status) : [...data];

            let processedData = filteredData.map(caravana => {
                const vagasOcupadas = caravana.vagasTotais - (caravana.vagasDisponiveis ?? caravana.vagasTotais);
                const ocupacao = caravana.vagasTotais > 0 ? (vagasOcupadas / caravana.vagasTotais) * 100 : 0;
                const lucroAtual = (vagasOcupadas * (caravana.preco || 0)) - (caravana.despesas || 0);
                return {
                    ...caravana,
                    vagasOcupadas: vagasOcupadas,
                    ocupacao: () => ocupacao,
                    lucroAtual: () => lucroAtual,
                    // Os objetos completos (administrador, motorista, guia) já estão aqui
                };
            });

            if (sortBy === 'data') {
                processedData.sort(sortByData);
            } else if (sortBy === 'ocupacao') {
                processedData.sort(sortByOcupacao);
            } else if (sortBy === 'lucroAtual') {
                processedData.sort(sortByLucroAtual);
            }

            setCaravanas(processedData);

        } catch (error) {
            setError(error.message);
            console.error("Erro ao buscar/processar Caravanas", error);
        } finally {
            setIsLoading(false);
        }
    };


    useEffect(() => {
        loadCaravanas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, sortBy, propCaravanas]);

    const handleStatusChange = (newStatus) => {
        setStatus(newStatus === status ? null : newStatus);
    };

    const handleSortChange = (newSortBy) => {
        setSortBy(newSortBy);
    };
    const toggleSubmenu = () => {
        setShowSubmenu(!showSubmenu);
    };
    const handleCancelar = async (id) => {
        if (!window.confirm("Tem certeza que deseja cancelar esta caravana?")) return;
        try {
            await api.cancelCaravan(id);
            loadCaravanas();
            alert('Caravana cancelada com sucesso!');
        } catch (error) {
            console.error("Erro ao cancelar Caravana (Front):", error);
            setError(error.message);
            alert(`Erro ao cancelar caravana: ${error.message}`);
        }
    };

    const handleDeletar = async (id) => {
        if (!window.confirm("Tem certeza que deseja EXCLUIR esta caravana?")) return;
        try {
            await api.deleteCaravana(id);
            loadCaravanas();
            alert('Caravana excluída com sucesso!');
        } catch (error) {
            setError(error.message);
            console.error("Erro ao deletar caravana:", error);
            alert(`Erro ao excluir caravana: ${error.message}`);
        }
    };

    const handleEdit = (caravana) => {
        setCaravanaParaEditar(caravana);
        setShowModalEditar(true);
    };

    const closeModalEditar = () => {
        setShowModalEditar(false);
        setCaravanaParaEditar(null);
    };

    const handleCaravanaSalva = () => {
        setShowModalEditar(false);
        setCaravanaParaEditar(null);
        loadCaravanas();
    };

    const openModalDetalhes = (caravana) => {
        setModalDetalhes(caravana);
    };

    const closeModalDetalhes = () => {
        setModalDetalhes(null);
    };

    const openModalParticipantes = (caravanaId) => {
        setModalParticipantes(caravanaId);
    };

    const closeModalParticipantes = () => {
        setModalParticipantes(null);
    };

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada': return 'Confirmada';
            case 'nao_confirmada': return 'Não Confirmada';
            case 'cancelada': return 'Cancelada';
            case 'concluida': return 'Concluída';
            default: return 'Desconhecido';
        }
    };


    if (error) return <div className={styles.error}>Erro: {error}</div>;


    return (
        <div className={styles.container}>
            <h2 className={styles.titulo}>Lista de Caravanas</h2>

            <div className={styles.menuContainer}>
                <button className={styles.menuButton} onClick={toggleSubmenu}>
                    Filtros e Ordenação {showSubmenu ? "▲" : "▼"}
                </button>
                {showSubmenu && (
                    <div className={styles.submenu}>
                        <div className={styles.submenuSection}>
                            <h3>Filtrar por Status:</h3>
                            <button className={status === null ? styles.activeButton : styles.button} onClick={() => handleStatusChange(null)}>Todas</button>
                            <button className={status === 'confirmada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('confirmada')}>Confirmadas</button>
                            <button className={status === 'nao_confirmada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('nao_confirmada')}>Não Confirmadas</button>
                            <button className={status === 'cancelada' ? styles.activeButton : styles.button} onClick={() => handleStatusChange('cancelada')}>Canceladas</button>
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

            {isLoading && <div className={styles.loading}>Carregando...</div>}
            {!isLoading && !error && caravanas.length === 0 && <p>Nenhuma caravana encontrada.</p>}

            {!isLoading && !error && caravanas.length > 0 && (
                 <div className={styles.cardContainer}>
                    {caravanas.map((caravana) => (
                        <CaravanaCard key={caravana.id} caravana={caravana}>
                             {/* --- Alteração SOMENTE AQUI para exibir NOMES --- */}
                            <div className={styles.adminInfo}>
                                <p><span className={styles.label}>Admin:</span> {caravana.administrador?.nome || 'N/A'}</p>
                                <p><span className={styles.label}>Motorista:</span> {caravana.motorista?.nome || 'N/A'}</p>
                                {caravana.guia && <p><span className={styles.label}>Guia:</span> {caravana.guia?.nome || 'N/A'}</p>}
                             </div>
                             {/* --- Fim da Alteração --- */}
                            <div className={styles.buttonGroup}>
                                <button className={styles.editButton} onClick={(event) => { event.stopPropagation(); handleEdit(caravana); }}>Editar</button>
                                <button className={styles.detailsButton} onClick={(e)=>{ e.stopPropagation(); openModalDetalhes(caravana); }}>Detalhes</button>
                                <button className={styles.participantsButton} onClick={(e)=>{ e.stopPropagation(); openModalParticipantes(caravana.id); }}>Participantes ({caravana.vagasOcupadas || 0})</button>
                            </div>
                            <div className={styles.divBotaoExcluir}>
                                {caravana.status !== 'cancelada' && ( <button className={styles.cancelButton} onClick={(e)=>{ e.stopPropagation(); handleCancelar(caravana.id); }}>Cancelar</button> )}
                                <button className={styles.deleteButton} onClick={(e)=>{ e.stopPropagation(); handleDeletar(caravana.id); }}>Excluir</button>
                            </div>
                        </CaravanaCard>
                    ))}
                </div>
             )}


            {showModalEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}>×</button>
                        <FormularioCaravana
                            caravana={caravanaParaEditar}
                            onSalvar={handleCaravanaSalva}
                            onCancelar={closeModalEditar}
                        />
                    </div>
                </div>
            )}

            {modalDetalhes && (
                <ModalDetalhesCaravana caravana={modalDetalhes} onClose={closeModalDetalhes} />
            )}


            {modalParticipantes && (
                <div className={styles.modalOverlay} onClick={closeModalParticipantes}>
                    <div className={styles.modalLarge || styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalParticipantes}>×</button>
                        <Participantes caravanaId={modalParticipantes} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ListaCaravanasAdmin;