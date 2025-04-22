import React from 'react';
import FormularioCaravana from '../formularios/FormularioCaravana';
import styles from './ModalCriarLocalidade.module.css';

function ModalCriarCaravana({ preSelectedLocalidadeId, onClose, onCaravanaCreated }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>
                <FormularioCaravana
                    preSelectedLocalidadeId={preSelectedLocalidadeId}
                    onSalvar={onCaravanaCreated}
                    onCancelar={onClose}
                />
            </div>
        </div>
    );
}

export default ModalCriarCaravana;