// src/components/CaravanaCard/CaravanaCard.js
import React from 'react';
import styles from './CaravanaCard.module.css';

const CaravanaCard = ({ caravana, isAdmin = false, children }) => {
  if (!caravana) {
    return <div>Caravana inválida.</div>;
  }

  const dataFormatada = new Date(caravana.data).toLocaleDateString();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0); // Zera as horas para comparação correta de datas
  const dataCaravana = new Date(caravana.data);
  dataCaravana.setHours(0, 0, 0, 0);

  const isCaravanaInativa =
    caravana.status === 'cancelada' ||
    (caravana.status === 'confirmada' && dataCaravana < hoje);
  const cardClassName = `${styles.card} ${
    isCaravanaInativa ? styles.caravanaInativa : ''
  }`;

  return (
    <div className={cardClassName}>
      <div className={styles.cardImageContainer}>
        {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 ? (
          <img
            src={caravana.imagensLocalidade[0]}
            alt={`Imagem de ${caravana.nomeLocalidade}`}
            className={styles.cardImage}
          />
        ) : (
          <p>Sem imagem</p>
        )}
      </div>
      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>{caravana.nomeLocalidade}</h3>
        <p className={styles.cardText}>Data: {dataFormatada}</p>
        <p className={styles.cardText}>
          Horário de Saída: {caravana.horarioSaida}
        </p>
        <p className={styles.cardText}>
          Status:{" "}
          {caravana.status === "confirmada"
            ? "Confirmada"
            : caravana.status === "nao_confirmada"
            ? "Não Confirmada"
            : caravana.status === "cancelada"
            ? "Cancelada"
            : "Desconhecido"}
        </p>

        {/* Exibição condicional e valores padrão (correção do toFixed): */}
        {isAdmin && (
          <>
            <p className={styles.cardText}>
              Lucro Total Potencial: R$ {(caravana.lucroTotal ?? 0).toFixed(2)}
            </p>
            <p className={styles.cardText}>
              Lucro Atual: R$ {(caravana.lucroAtual ?? 0).toFixed(2)}
            </p>
            <p className={styles.cardText}>ROI: {(caravana.roi ?? 0).toFixed(2)}%</p>
          </>
        )}
        {children}
      </div>
    </div>
  );
};

export default CaravanaCard;
