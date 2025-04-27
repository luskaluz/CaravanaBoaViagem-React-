// src/components/Admin/modal/ModalCriarTransporte.js
import React from 'react';
import FormularioTransporte from '../formularios/FormularioTransportes';
import styles from './ModalCriarLocalidade.module.css'; // Reutilize um CSS de modal existente

function ModalCriarTransporte({ onClose, onSave }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>
                <FormularioTransporte onSalvar={onSave} onCancelar={onClose} />
            </div>
        </div>
    );
}
export default ModalCriarTransporte;