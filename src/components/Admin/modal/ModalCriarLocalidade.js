// src/components/modal/ModalCriarLocalidade.js
import React from 'react';
import FormularioLocalidade from '../formularios/FormularioLocalidade';
import styles from './ModalCriarLocalidade.module.css'; // Crie este arquivo CSS

function ModalCriarLocalidade({ onClose, onLocalidadeSalva }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                <FormularioLocalidade onSalvar={onLocalidadeSalva} onCancelar={onClose} />
            </div>
        </div>
    );
}

export default ModalCriarLocalidade;
