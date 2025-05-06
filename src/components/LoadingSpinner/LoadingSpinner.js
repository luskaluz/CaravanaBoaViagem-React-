import React from 'react';
import styles from './LoadingSpinner.module.css';

function LoadingSpinner({ mensagem = "Carregando..." }) { // Mensagem padrão
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.spinner}></div>
      {mensagem && <p className={styles.mensagem}>{mensagem}</p>}
    </div>
  );
}

export default LoadingSpinner;