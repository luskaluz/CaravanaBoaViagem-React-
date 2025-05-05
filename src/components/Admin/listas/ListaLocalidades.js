import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaLocalidades.module.css';
import ModalCriarCaravana from '../modal/ModalCriarCaravana';
import FormularioLocalidade from '../formularios/FormularioLocalidade';


function ListaLocalidades({ openModalCriarLocalidade }) {
    const [localidades, setLocalidades] = useState([]);
    const [error, setError] = useState(null);
    const [showModalCriarCaravana, setShowModalCriarCaravana] = useState(false);
    const [selectedLocalidade, setSelectedLocalidade] = useState(null);
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [localidadeParaEditar, setLocalidadeParaEditar] = useState(null);
    const [isLoading, setIsLoading] = useState(false); // Adicionado Loading

    const loadLocalidades = async () => {
        setIsLoading(true); // Inicia loading
        setError(null);
        try {
            const data = await api.getLocalidades();
            setLocalidades(data);
        } catch (error) {
            setError(error.message);
            console.error("Erro ao buscar localidades:", error);
        } finally {
             setIsLoading(false); // Termina loading
        }
    };


    useEffect(() => {
        loadLocalidades();
    }, []);

    const handleDeletar = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta localidade?")) {
            try {
                await api.deleteLocalidade(id);
                // Remove localmente para feedback imediato
                setLocalidades(prevLocalidades => prevLocalidades.filter(localidade => localidade.id !== id));
                alert('Localidade excluída com sucesso!');
            } catch (error) {
                setError(error.message);
                console.error("Erro ao deletar Localidade:", error);
                alert(`Erro ao excluir: ${error.message}`);
            }
        }
    };


     const handleCriarCaravana = (localidade) => {
        setSelectedLocalidade(localidade);
        setShowModalCriarCaravana(true);
    };

    const closeModalCriarCaravana = () => {
        setShowModalCriarCaravana(false);
        setSelectedLocalidade(null);
    };

    // --- CORREÇÃO AQUI ---
    const handleCaravanaCreated = () => {
        alert('Caravana criada com sucesso!'); // Feedback opcional
        closeModalCriarCaravana(); // <<< FECHA O MODAL
        // Opcional: Recarregar localidades se a criação de caravana afetar algo aqui
        // loadLocalidades();
    };
    // --- FIM CORREÇÃO ---


    const handleEditar = (localidade) => {
        setLocalidadeParaEditar(localidade);
        setShowModalEditar(true);
    };

    const closeModalEditar = () => {
        setShowModalEditar(false);
        setLocalidadeParaEditar(null);
    };

    const handleLocalidadeSalva = () => {
        setShowModalEditar(false);
        setLocalidadeParaEditar(null);
        loadLocalidades(); // Recarrega localidades após salvar edição
        alert('Localidade atualizada com sucesso!'); // Feedback
    };


    if (error) return <div className={styles.error}>Erro ao carregar localidades: {error}</div>;

    return (
        <div className={styles.container}>
             <div className={styles.header || ''}>
                <h2>Lista de Localidades</h2>
             </div>

             {isLoading && <p className={styles.loading}>Carregando localidades...</p>}

            {!isLoading && !error && localidades.length === 0 ? (
                <p>Nenhuma localidade cadastrada.</p>
            ) : !isLoading && !error && (
                <ul className={styles.list}>
                    {localidades.map((localidade) => (
                       <li key={localidade.id} className={styles.listItem}>
                           <div className={styles.imagemContainer}>
                               {localidade.imagens && localidade.imagens.length > 0 ? (
                                   <img src={localidade.imagens[0]} alt={localidade.nome} className={styles.miniatura}/>
                               ) : ( <div className={styles.miniatura} style={{backgroundColor: '#f0f0f0'}}></div> )}
                           </div>
                           <div className={styles.localidadeInfo}>
                               <p><span className={styles.label}>Nome:</span> {localidade.nome}</p><br />
                               {localidade.descricao && ( <p><span className={styles.label}>Descrição:</span><br/><br/> {localidade.descricao}</p> )}
                           </div>
                           <div className={styles.buttonGroup}>
                               <button className={styles.editButton} onClick={() => handleEditar(localidade)}>Editar</button>
                               <button className={styles.deleteButton} onClick={() => handleDeletar(localidade.id)}>Excluir</button>
                               <button className={styles.detailsButton} onClick={() => handleCriarCaravana(localidade)}>Criar Caravana</button>
                           </div>
                       </li>
                    ))}
                </ul>
            )}

            {showModalEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}>×</button>
                        <FormularioLocalidade
                            localidade={localidadeParaEditar}
                            onSalvar={handleLocalidadeSalva} // Usa a função que fecha o modal
                            onCancelar={closeModalEditar}
                        />
                    </div>
                </div>
            )}
            {showModalCriarCaravana && (
                <ModalCriarCaravana
                    preSelectedLocalidadeId={selectedLocalidade?.id} // Passa ID com segurança
                    onClose={closeModalCriarCaravana}
                    onCaravanaCreated={handleCaravanaCreated} // Usa a função que fecha o modal
                />
            )}
        </div>
    );
}

export default ListaLocalidades;