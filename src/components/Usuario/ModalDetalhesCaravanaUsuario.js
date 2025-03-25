import React from 'react';
import styles from './ModalDetalhesCaravanaUsuario.module.css';
import DetalhesCaravanaUsuario from './DetalhesCaravanaUsuario';

function ModalDetalhesCaravanaUsuario({ caravana, onClose }) {
    if (!caravana) {
        return null;
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                <DetalhesCaravanaUsuario caravana={caravana} />
            </div>
        </div>
    );
}

export default ModalDetalhesCaravanaUsuario;
