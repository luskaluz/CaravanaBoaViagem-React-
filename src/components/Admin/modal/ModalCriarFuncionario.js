import React from 'react';
import FormularioFuncionario from '../formularios/FormularioFuncionario';
import styles from './ModalCriarFuncionario.module.css';

function ModalCriarFuncionario({ onClose, onSave }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <FormularioFuncionario
                    onSalvar={onSave}
                    onCancelar={onClose}
                />
            </div>
        </div>
    );
}

export default ModalCriarFuncionario;