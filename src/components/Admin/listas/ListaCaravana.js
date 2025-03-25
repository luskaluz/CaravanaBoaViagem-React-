// src/components/Admin/listas/ListaCaravana.js
import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaCaravana.module.css';
import ModalDetalhesCaravana from '../modal/ModalDetalhesCaravana';
import Participantes from '../modal/Participantes'; //  OK
import { useNavigate } from 'react-router-dom';
import FormularioCaravana from '../formularios/FormularioCaravana';
import CaravanaCard from '../../CaravanaCard/CaravanaCard';

function ListaCaravanasAdmin({ caravanas: propCaravanas, onCaravanaClick }) {
    const [caravanas, setCaravanas] = useState(propCaravanas || []);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState(null);
    const [sortBy, setSortBy] = useState('data');
    const [showSubmenu, setShowSubmenu] = useState(false);
    const [modalDetalhes, setModalDetalhes] = useState(null);
    const [modalParticipantes, setModalParticipantes] = useState(null); // Estado para o ID da caravana
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

        if (statusA !== statusB) {
            return statusA - statusB;
        }

        if (!isPastA && !isPastB) {
            return dateA - dateB
        }

        if (isPastA && isPastB) {
            return dateB - dateA
        }

        return isPastA ? 1 : -1;
    };

    const sortByOcupacao = (a, b) => {
        const ocupacaoA = Number(a.ocupacao());
        const ocupacaoB = Number(b.ocupacao());
        return ocupacaoB - ocupacaoA;
    };

    const sortByLucroAtual = (a, b) => {
        const lucroA = Number(a.lucroAtual());
        const lucroB = Number(b.lucroAtual());
        return lucroB - lucroA;
    };

    useEffect(() => {
        const fetchCaravanas = async () => {
            setError(null);
            try {
                let data = propCaravanas;
                if (!propCaravanas) {
                    data = await api.getCaravanas();
                }

                let filteredData = status ? data.filter(c => c.status === status) : [...data];

                filteredData = filteredData.map(caravana => {
                    const ocupacao = caravana.vagasTotais > 0
                        ? ((caravana.vagasTotais - caravana.vagasDisponiveis) / caravana.vagasTotais) * 100
                        : 0;

                    const lucroAtual = (caravana.vagasTotais - caravana.vagasDisponiveis) * caravana.preco - caravana.despesas;

                    return {
                        ...caravana,
                        ocupacao: () => ocupacao,
                        lucroAtual: () => lucroAtual,
                    };
                });

                if (sortBy === 'data') {
                    filteredData.sort(sortByData);
                } else if (sortBy === 'ocupacao') {
                    filteredData.sort(sortByOcupacao);
                } else if (sortBy === 'lucroAtual') {
                    filteredData.sort(sortByLucroAtual);
                }

                setCaravanas(filteredData);

            } catch (error) {
                setError(error.message);
                console.error("Erro ao buscar Caravanas", error)
            }
        };

        fetchCaravanas();
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
        try {
            await api.cancelCaravan(id);
            setCaravanas(prevCaravanas => prevCaravanas.map(c => {
                if (c.id === id) {
                    return { ...c, status: 'cancelada' };
                }
                return c;
            }));
            alert('Caravana cancelada com sucesso!');
        } catch (error) {
            console.error("Erro ao cancelar Caravana (Front):", error);
            setError(error.message);
            alert(`Erro ao cancelar caravana: ${error.message}`);
        }
    };

    const handleDeletar = async (id) => {

        try {
            await api.deleteCaravana(id);
            setCaravanas(prevCaravanas => prevCaravanas.filter(caravana => caravana.id !== id));
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


        if (typeof loadCaravanas === 'function') {
            loadCaravanas();
        }
    };

    const handleCaravanaSalva = () => {
        setShowModalEditar(false);
        setCaravanaParaEditar(null);
        loadCaravanas(); // ISSO ESTAVA FALTANDO
    };


    const loadCaravanas = async () => {
        setError(null);
        try {
            let data;
            if (status) {
                data = await api.getCaravanasPorStatus(status);
            } else {
                data = await api.getCaravanas(sortBy);
            }
            setCaravanas(data);
        } catch (error) {
            setError(error.message);
            console.error("Erro ao buscar caravanas:", error);
        }
    };

    const openModalDetalhes = (caravana) => {
        setModalDetalhes(caravana);
    };

    const closeModalDetalhes = () => {
        setModalDetalhes(null);
    };

    // Mudanças aqui: Abre o modal *apenas* com o ID da caravana
    const openModalParticipantes = (caravanaId) => {
        setModalParticipantes(caravanaId);
    };

    const closeModalParticipantes = () => {
        setModalParticipantes(null);
    };

    const translateStatus = (status) => {
        switch (status) {
            case 'confirmada':
                return 'Confirmada';
            case 'nao_confirmada':
                return 'Não Confirmada';
            case 'cancelada':
                return 'Cancelada';
            default:
                return 'Status Desconhecido';
        }
    };


    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.titulo}>Lista de Caravanas</h2>

            <div className={styles.menuContainer}>
                <button className={styles.menuButton} onClick={toggleSubmenu}>
                    Caravanas {showSubmenu ? "▲" : "▼"}
                </button>
                {showSubmenu && (
                    <div className={styles.submenu}>
                        <div className={styles.submenuSection}>
                            <h3>Filtrar por Status:</h3>
                            <button
                                className={status === null ? styles.activeButton : styles.button}
                                onClick={() => handleStatusChange(null)}
                            >
                                Todas
                            </button>
                            <button
                                className={status === 'confirmada' ? styles.activeButton : styles.button}
                                onClick={() => handleStatusChange('confirmada')}
                            >
                                Confirmadas
                            </button>
                            <button
                                className={status === 'nao_confirmada' ? styles.activeButton : styles.button}
                                onClick={() => handleStatusChange('nao_confirmada')}
                            >
                                Não Confirmadas
                            </button>
                            <button
                                className={status === 'cancelada' ? styles.activeButton : styles.button}
                                onClick={() => handleStatusChange('cancelada')}
                            >
                                Canceladas
                            </button>
                        </div>
                        <div className={styles.submenuSection}>
                            <h3>Ordenar por:</h3>
                            <button
                                className={sortBy === 'data' ? styles.activeButton : styles.button}
                                onClick={() => handleSortChange('data')}
                            >
                                Data
                            </button>
                            <button
                                className={sortBy === 'ocupacao' ? styles.activeButton : styles.button}
                                onClick={() => handleSortChange('ocupacao')}
                            >
                                Ocupação (%)
                            </button>
                            <button
                                className={sortBy === 'lucroAtual' ? styles.activeButton : styles.button}
                                onClick={() => handleSortChange('lucroAtual')}
                            >
                                Lucro Atual
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.cardContainer}>
                {caravanas.map((caravana) => (
                    <CaravanaCard key={caravana.id} caravana={caravana}>
                        <div className={styles.buttonGroup}>
                            <button
                                className={styles.editButton}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleEdit(caravana);
                                }}
                            >
                                Editar
                            </button>
                            <button
                                className={styles.detailsButton}
                                onClick={() => openModalDetalhes(caravana)}
                            >
                                Detalhes
                            </button>
                            <button
                                className={styles.participantsButton}
                                onClick={() => openModalParticipantes(caravana.id)} // Passa só o ID
                            >
                                Participantes
                            </button>
                        </div>
                        <div className={styles.divBotaoExcluir}>

                            {caravana.status !== 'cancelada' && (
                                <button
                                    className={styles.cancelButton}
                                    onClick={() => handleCancelar(caravana.id)}
                                >
                                    Cancelar
                                </button>
                            )}
                            <button className={styles.deleteButton} onClick={() => handleDeletar(caravana.id)}>Excluir</button>

                        </div>
                    </CaravanaCard>
                ))}
            </div>

            {showModalEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}>&times;</button>
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
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <button className={styles.modalClose} onClick={closeModalParticipantes}>
                            &times;
                        </button>
                        <Participantes caravanaId={modalParticipantes} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ListaCaravanasAdmin;
