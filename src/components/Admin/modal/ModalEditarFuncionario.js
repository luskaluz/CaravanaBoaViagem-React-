import React from 'react';
import FormularioFuncionario from '../formularios/FormularioFuncionario';
import styles from './ModalEditarFuncionario.module.css';

function ModalEditarFuncionario({ funcionario, onClose, onSave }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>
                <FormularioFuncionario
                    funcionario={funcionario}
                    onSalvar={onSave}
                    onCancelar={onClose}
                />
            </div>
        </div>
    );
}

export default ModalEditarFuncionario;