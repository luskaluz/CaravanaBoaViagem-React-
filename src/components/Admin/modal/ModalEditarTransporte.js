// src/components/Admin/modal/ModalEditarTransporte.js
import React from 'react';
import FormularioTransporte from '../formularios/FormularioTransportes';
import styles from './ModalCriarLocalidade.module.css'; // Reutilize um CSS de modal existente

function ModalEditarTransporte({ transporte, onClose, onSave }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <FormularioTransporte transporte={transporte} onSalvar={onSave} onCancelar={onClose} />
            </div>
        </div>
    );
}
export default ModalEditarTransporte;