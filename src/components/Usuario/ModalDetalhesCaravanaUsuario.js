// ModalDetalhesCaravanaUsuario.js
import React from 'react';
import styles from './ModalDetalhesCaravanaUsuario.module.css';
import DetalhesCaravanaUsuario from './DetalhesCaravanaUsuario';

function ModalDetalhesCaravanaUsuario({ caravana, usuarioLogado, onClose }) { // <<< Recebe usuarioLogado
    if (!caravana) {
        return null;
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>
                <DetalhesCaravanaUsuario
                    caravana={caravana}
                    usuarioLogado={usuarioLogado} // <<< Passa para o componente de detalhes
                />
            </div>
        </div>
    );
}

export default ModalDetalhesCaravanaUsuario;