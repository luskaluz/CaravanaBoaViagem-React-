import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaLocalidades.module.css';
import ModalCriarCaravana from '../modal/ModalCriarCaravana';
import FormularioLocalidade from '../formularios/FormularioLocalidade';


function ListaLocalidades({ openModalCriarLocalidade }) { // Recebe a prop
    const [localidades, setLocalidades] = useState([]);
    const [error, setError] = useState(null);
    const [showModalCriarCaravana, setShowModalCriarCaravana] = useState(false);
    const [selectedLocalidade, setSelectedLocalidade] = useState(null);
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [localidadeParaEditar, setLocalidadeParaEditar] = useState(null);


    useEffect(() => {
        loadLocalidades();
    }, []);

    const handleDeletar = async (id) => {
        try {
            if (window.confirm("Tem certeza que deseja excluir esta localidade?")) {
                await api.deleteLocalidade(id);
                setLocalidades(prevLocalidades => prevLocalidades.filter(localidade => localidade.id !== id));
                alert('Localidade excluída com sucesso!');
            }
        } catch (error) {
            setError(error.message);
            console.error("Erro ao deletar Localidade:", error)
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

    const handleCaravanaCreated = () => {
        loadLocalidades();
    };


    const loadLocalidades = async () => {
        try {
            setError(null);
            const data = await api.getLocalidades();
            setLocalidades(data);
        } catch (error) {
            setError(error.message);
        }
    };

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
        loadLocalidades();
    };


    if (error) return <div>Erro: {error}</div>;

    return (
        <div className={styles.container}>
            <h2>Lista de Localidades</h2>
             {/* Chama a função passada por prop */}
            <button onClick={openModalCriarLocalidade} className={styles.addButton}>
                Criar Localidade
            </button>

            {localidades.length === 0 ? (
                <p>Nenhuma localidade cadastrada.</p>
            ) : (
                <ul className={styles.list}>
                    {localidades.map((localidade) => (
                       <li key={localidade.id} className={styles.listItem}>
                       {/* Coluna da Imagem */}
                       <div className={styles.imagemContainer}>
                           {localidade.imagens && localidade.imagens.length > 0 ? (
                               <img
                                   src={localidade.imagens[0]}
                                   alt={`Imagem de ${localidade.nome}`}
                                   className={styles.miniatura}
                               />
                           ) : (
                               <div className={styles.miniatura} style={{backgroundColor: '#f0f0f0'}}></div>
                           )}
                       </div>
                       
                       {/* Coluna das Informações */}
                       <div className={styles.localidadeInfo}>
                           <p><span className={styles.label}>Nome:</span> {localidade.nome}</p><br />
                           {localidade.descricao && (
                               <p><span className={styles.label}>Descrição:</span><br/><br/> {localidade.descricao}</p>
                           )}
                       </div>
                       
                       {/* Coluna dos Botões */}
                       <div className={styles.buttonGroup}>
                           <button className={styles.editButton} onClick={() => handleEditar(localidade)}>Editar</button>
                           <button className={styles.deleteButton} onClick={() => handleDeletar(localidade.id)}>Excluir</button>
                           <button className={styles.detailsButton} onClick={() => handleCriarCaravana(localidade)}>
                               Criar Caravana
                           </button>
                       </div>
                   </li>
                    ))}
                </ul>
            )}

            {showModalEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}>&times;</button>
                        <FormularioLocalidade
                            localidade={localidadeParaEditar}
                             onSalvar={handleLocalidadeSalva}
                            onCancelar={closeModalEditar}
                        />
                    </div>
                </div>
            )}
             {showModalCriarCaravana && (
                <ModalCriarCaravana
                preSelectedLocalidadeId={selectedLocalidade.id}
                    onClose={closeModalCriarCaravana}
                    onCaravanaCreated={handleCaravanaCreated}
                />
            )}
        </div>
    );
}

export default ListaLocalidades;
