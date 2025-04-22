import React from 'react';
import DetalhesCaravanaFuncionario from './DetalhesCaravanaFuncionario';
// <<< IMPORTA O CSS DO MODAL (Pode ser o mesmo do criar localidade/funcionário) >>>
import styles from './ModalDetalhesCaravanasFuncionario.module.css'; 

function ModalDetalhesCaravanasFuncionario({ caravana, onClose }) {
  if (!caravana) return null;

  return (
    // Usa as classes do CSS do modal importado
    <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

            <DetalhesCaravanaFuncionario caravana={caravana} />
        </div>
    </div>
  );
}

export default ModalDetalhesCaravanasFuncionario;