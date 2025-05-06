// src/components/Admin/modal/ParticipantesModal.js (ou caminho similar)
import React from 'react';
import Participantes from './Participantes'; // Importa o componente de lógica
import styles from '../../Usuario/DashboardUsuario.module.css'; // Pode reutilizar estilos de modal do usuário
                                                        // ou um CSS específico para modais como './ModalBase.module.css'

function ParticipantesModal({ caravanaId, funcionarioUid, cargo, onClose }) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modal} ${styles.modalLarge}`} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>×</button>
                <Participantes
                    caravanaId={caravanaId}
                    funcionarioUid={funcionarioUid} // Passa adiante se recebido
                    cargo={cargo}                   // Passa adiante se recebido
                />
            </div>
        </div>
    );
}

export default ParticipantesModal;