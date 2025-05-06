import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import ModalCriarFuncionario from '../modal/ModalCriarFuncionario';
import ModalEditarFuncionario from '../modal/ModalEditarFuncionario';
import styles from './ListaFuncionariosAdmin.module.css';
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner';

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/60?text=Foto";

function ListaFuncionariosAdmin() {
    const [funcionarios, setFuncionarios] = useState([]);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [funcionarioParaEditar, setFuncionarioParaEditar] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const carregarFuncionarios = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getFuncionarios();
            setFuncionarios(data || []); // Garante que seja um array
        } catch (error) {
            setError(error.message || "Erro desconhecido ao buscar funcionários.");
            console.error("Erro ao buscar funcionários:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        carregarFuncionarios();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir este funcionário? Esta ação é irreversível.")) {
            setError(null);
            try {
                await api.deleteFuncionario(id);
                setFuncionarios(prevFuncionarios => prevFuncionarios.filter(func => (func.id || func.uid) !== id));
                 alert('Funcionário excluído com sucesso!');
            } catch (error) {
                setError(error.message || "Erro desconhecido ao excluir.");
                console.error("Erro ao deletar funcionário:", error);
                alert(`Erro ao excluir: ${error.message}`);
            }
        }
    };

    const handleAbrirModalEditar = (funcionario) => {
        setFuncionarioParaEditar(funcionario);
        setShowEditModal(true);
    };

    const handleFecharModalEditar = () => {
        setShowEditModal(false);
        setFuncionarioParaEditar(null);
    };

    const handleFuncionarioSalvo = () => {
        setShowEditModal(false);
        setShowCreateModal(false);
        setFuncionarioParaEditar(null);
        carregarFuncionarios();
    };

    const handleAbrirModalCriar = () => {
        setShowCreateModal(true);
    };

    const handleFecharModalCriar = () => {
        setShowCreateModal(false);
    };

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSpinner mensagem="Carregando funcionários..." />;
        }
        if (error) {
            return <div className={styles.error}>Erro ao carregar funcionários: {error}</div>;
        }
        if (funcionarios.length === 0) {
            return <p>Nenhum funcionário cadastrado.</p>;
        }
        return (
            <ul className={styles.list}>
               {funcionarios.map((func) => (
                   <li key={func.id || func.uid} className={styles.listItem}>
                       <div className={styles.funcionarioDetalhes}>
                            <img
                                src={func.fotoUrl || PLACEHOLDER_IMAGE_URL}
                                alt={`Foto de ${func.nome}`}
                                className={styles.funcionarioFoto}
                                onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}
                            />
                            <div className={styles.funcionarioInfo}>
                                <p><span className={styles.label}>Nome:</span> {func.nome || 'N/A'}</p>
                                <p><span className={styles.label}>Email:</span> {func.email || 'N/A'}</p>
                                <p><span className={styles.label}>Telefone:</span> {func.telefone || 'N/A'}</p>
                                <p><span className={styles.label}>Cargo:</span> {func.cargo || 'Não definido'}</p>
                            </div>
                       </div>
                       <div className={styles.buttonGroup}>
                           <button className={styles.editButton} onClick={() => handleAbrirModalEditar(func)}>Editar</button>
                           <button className={styles.deleteButton} onClick={() => handleDelete(func.id || func.uid)}>Excluir</button>
                       </div>
                   </li>
               ))}
            </ul>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Lista de Funcionários</h2>
                <button onClick={handleAbrirModalCriar} className={styles.addButton} disabled={isLoading}>
                    Criar Novo Funcionário
                </button>
            </div>

            {renderContent()}

            {showCreateModal && (
                <ModalCriarFuncionario
                    onClose={handleFecharModalCriar}
                    onSave={handleFuncionarioSalvo}
                />
            )}

            {showEditModal && funcionarioParaEditar && (
                <ModalEditarFuncionario
                    funcionario={funcionarioParaEditar}
                    onClose={handleFecharModalEditar}
                    onSave={handleFuncionarioSalvo}
                />
            )}
        </div>
    );
}

export default ListaFuncionariosAdmin;