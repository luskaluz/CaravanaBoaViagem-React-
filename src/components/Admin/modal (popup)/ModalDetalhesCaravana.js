import React from 'react';
import styles from './ModalDetalhesCaravana.module.css';
import DetalhesCaravana from '../DetalhesCaravanaAdmin';

function ModalDetalhesCaravana({ caravana, onClose }) {
    if (!caravana) {
        return null;
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                <DetalhesCaravana caravana={caravana} />
            </div>
        </div>
    );
}

export default ModalDetalhesCaravana;
