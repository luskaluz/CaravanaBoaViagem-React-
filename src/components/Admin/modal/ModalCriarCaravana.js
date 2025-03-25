// src/components/Admin/ModalCriarCaravana.js
import React from 'react';
import FormularioCaravana from '../formularios/FormularioCaravana';
import styles from './ModalCriarCaravana.module.css'; 

function ModalCriarCaravana({ localidadeId, onClose, onCaravanaCreated }) {

    const handleCaravanaSalva = () => {
        onClose();
        if (onCaravanaCreated) {
           onCaravanaCreated()
        }
    };


    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
 
                <FormularioCaravana
                    localidadeId={localidadeId}
                    onSalvar={handleCaravanaSalva}
                    onCancelar={onClose}
                />
            </div>
        </div>
    );
}

export default ModalCriarCaravana;
