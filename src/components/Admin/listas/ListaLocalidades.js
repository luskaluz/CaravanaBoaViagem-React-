import React, { useState, useEffect } from 'react';
import * as api from '../../../services/api';
import styles from './ListaLocalidades.module.css';
import ModalCriarCaravana from '../modal/ModalCriarCaravana';
import FormularioLocalidade from '../formularios/FormularioLocalidade';
import ModalCriarLocalidade from '../modal/ModalCriarLocalidade'; // Importa o modal de criar
import LoadingSpinner from '../../LoadingSpinner/LoadingSpinner'; // Importa Spinner

function ListaLocalidades() { // Removida prop não usada openModalCriarLocalidade
    const [localidades, setLocalidades] = useState([]);
    const [error, setError] = useState(null);
    const [showModalCriarCaravana, setShowModalCriarCaravana] = useState(false);
    const [selectedLocalidade, setSelectedLocalidade] = useState(null);
    const [showModalEditar, setShowModalEditar] = useState(false);
    const [localidadeParaEditar, setLocalidadeParaEditar] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // Inicia true
    const [showModalCriar, setShowModalCriar] = useState(false); // Estado para modal de criar localidade

    const loadLocalidades = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getLocalidades();
            setLocalidades(data);
        } catch (error) {
            setError(error.message || "Erro desconhecido ao buscar localidades.");
            console.error("Erro ao buscar localidades:", error);
        } finally {
             setIsLoading(false);
        }
    };

    useEffect(() => { loadLocalidades(); }, []);

    const handleDeletar = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta localidade?")) {
             // Opcional: setIsLoading(true) ou loading específico
            try {
                await api.deleteLocalidade(id);
                setLocalidades(prev => prev.filter(loc => loc.id !== id));
                alert('Localidade excluída!');
            } catch (error) { setError(error.message); alert(`Erro ao excluir: ${error.message}`); }
            finally { /* Parar loading específico */ }
        }
    };

    const handleCriarCaravana = (localidade) => { setSelectedLocalidade(localidade); setShowModalCriarCaravana(true); };
    const closeModalCriarCaravana = () => { setShowModalCriarCaravana(false); setSelectedLocalidade(null); };
    const handleCaravanaCreated = () => { alert('Caravana criada!'); closeModalCriarCaravana(); };
    const handleEditar = (localidade) => { setLocalidadeParaEditar(localidade); setShowModalEditar(true); };
    const closeModalEditar = () => { setShowModalEditar(false); setLocalidadeParaEditar(null); };
    const handleLocalidadeSalva = () => { closeModalEditar(); setShowModalCriar(false); loadLocalidades(); }; // Fecha ambos os modais

    // Funções para o modal de CRIAR localidade
    const openModalCriar = () => { setShowModalCriar(true); };
    const closeModalCriar = () => { setShowModalCriar(false); };


    const renderContent = () => {
        if (isLoading) return <LoadingSpinner mensagem="Carregando localidades..." />;
        if (error) return <div className={styles.error}>Erro ao carregar localidades: {error}</div>;
        if (localidades.length === 0) return <p>Nenhuma localidade cadastrada.</p>;

        return (
            <ul className={styles.list}>
                {localidades.map((localidade) => (
                   <li key={localidade.id} className={styles.listItem}>
                       <div className={styles.imagemContainer}>
                           {localidade.imagens && localidade.imagens.length > 0 ? (
                               <img src={localidade.imagens[0]} alt={localidade.nome} className={styles.miniatura}/>
                           ) : ( <div className={styles.miniaturaPlaceholder}></div> )} {/* Usa classe placeholder */}
                       </div>
                       <div className={styles.localidadeInfo}>
                           <p><span className={styles.label}>Nome:</span> {localidade.nome}</p>
                           {localidade.descricao && ( <p className={styles.descricao}><span className={styles.label}>Descrição:</span> {localidade.descricao}</p> )}
                       </div>
                       <div className={styles.buttonGroup}>
                           <button className={styles.editButton} onClick={() => handleEditar(localidade)}>Editar</button>
                           <button className={styles.deleteButton} onClick={() => handleDeletar(localidade.id)}>Excluir</button>
                           <button className={styles.detailsButton} onClick={() => handleCriarCaravana(localidade)}>Criar Caravana</button>
                       </div>
                   </li>
                ))}
            </ul>
        );
    }

    return (
        <div className={styles.container}>
             <div className={styles.header}>
                <h2>Lista de Localidades</h2>
                 {/* Botão para abrir o modal de criar */}
                 <button onClick={openModalCriar} className={styles.addButton} disabled={isLoading}>
                     Adicionar Localidade
                 </button>
             </div>

            {renderContent()}

            {/* Modal para CRIAR Localidade */}
            {showModalCriar && (
                 <ModalCriarLocalidade
                    onClose={closeModalCriar}
                    onSave={handleLocalidadeSalva} // Reutiliza a função que fecha e recarrega
                 />
            )}

             {/* Modal para EDITAR Localidade */}
            {showModalEditar && localidadeParaEditar && (
                <div className={styles.modalOverlay} onClick={closeModalEditar}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={closeModalEditar}></button>
                        <FormularioLocalidade
                            localidade={localidadeParaEditar}
                            onSalvar={handleLocalidadeSalva}
                            onCancelar={closeModalEditar}
                        />
                    </div>
                </div>
            )}

             {/* Modal para CRIAR Caravana a partir da localidade */}
            {showModalCriarCaravana && selectedLocalidade && (
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