import React, { useMemo } from 'react';
import styles from './CaravanaCard.module.css';
import translateStatus from '../translate/translate'; // Supondo que você tem este helper

const CaravanaCard = ({ caravana, isAdmin = false, children }) => {

  // --- CORREÇÃO: useMemo movido para o topo ---
  const { vagasCliente, capacidadeTotalExibida, ocupacaoTotal, vagasRestantesTotal } = useMemo(() => {
      // Se caravana não existe ainda, retorna valores padrão
      if (!caravana) {
          return { vagasCliente: 0, capacidadeTotalExibida: 0, ocupacaoTotal: 0, vagasRestantesTotal: 0 };
      }

      let capacidadeBase = 0;
      let numAdminsConsiderados = 0;
      const vagasOcupClientes = caravana.vagasOcupadas || 0;
      const transporteDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

      if (transporteDefinido) {
          capacidadeBase = caravana.capacidadeFinalizada || 0;
          if (capacidadeBase > 0 && Array.isArray(caravana.transportesFinalizados)) {
              numAdminsConsiderados = Math.min(capacidadeBase, caravana.transportesFinalizados.length);
          }
      } else {
          capacidadeBase = caravana.capacidadeMaximaTeorica || 0;
          if (capacidadeBase > 0) {
              numAdminsConsiderados = Math.min(capacidadeBase, caravana.maximoTransportes || 0);
          }
      }

      const vagasDispCliente = Math.max(0, capacidadeBase - vagasOcupClientes - numAdminsConsiderados);
      const ocupTotal = vagasOcupClientes + numAdminsConsiderados; // Ocupação total = clientes + admins considerados
      const vagasRestTotal = Math.max(0, capacidadeBase - ocupTotal); // Vagas restantes totais

      return {
          vagasCliente: vagasDispCliente,
          capacidadeTotalExibida: capacidadeBase,
          ocupacaoTotal: ocupTotal,
          vagasRestantesTotal: vagasRestTotal
      };
  }, [caravana]); // Depende apenas da caravana


  // --- Verificação de caravana inválida vem DEPOIS do useMemo ---
  if (!caravana) {
    return <div className={styles.card}>Caravana inválida.</div>;
  }

  const formatarData = (dataString) => {
      if (!dataString) return 'N/A';
      try {
          const dt = new Date(dataString + 'T00:00:00Z');
          if (!isNaN(dt.getTime())) {
               const options = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' };
               return dt.toLocaleDateString('pt-BR', options);
          }
      } catch (e) { console.warn("Erro formatar data card:", dataString); }
      return 'Data inválida';
  };

  const dataFormatada = formatarData(caravana.data);
  const dataCaravanaUTC = caravana.data ? new Date(caravana.data + 'T00:00:00Z') : null;
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  const isPast = dataCaravanaUTC && dataCaravanaUTC < hoje;
  const isCancelled = caravana.status === 'cancelada';
  const isConcluida = caravana.status === 'concluida';
  const isCaravanaInativa = isCancelled || isConcluida || isPast;

  const cardClassName = `${styles.card} ${isCaravanaInativa ? styles.caravanaInativa : ''}`;

  return (
    <div className={cardClassName}>
      <div className={styles.cardImageContainer}>
        <img
            src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || "./images/imagem_padrao.jpg"}
            alt={`Imagem de ${caravana.nomeLocalidade || 'Caravana'}`}
            className={styles.cardImage}
            onError={(e) => {
                 e.target.onerror = null;
                 if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && e.target.src !== caravana.imagensLocalidade[0]) {
                      e.target.src = caravana.imagensLocalidade[0];
                 } else {
                     e.target.src = "./images/imagem_padrao.jpg";
                 }
            }}
        />
      </div>
      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h3>
        <p className={styles.cardText}>Data: {dataFormatada}</p>
        <p className={styles.cardText}>Saída: {caravana.horarioSaida || 'A definir'}</p>
        <p className={styles.cardText}>Status: {translateStatus(caravana.status)}</p>
        <p className={styles.cardText}>
             Vagas: {
               capacidadeTotalExibida === 0 ? 'A definir'
               : vagasCliente === 0 ? 'Esgotado'
               : vagasCliente
             }
         </p>

        {isAdmin && (
          <div className={styles.adminDetails}>
             <p className={styles.cardTextDetail}>
               Capacidade: {capacidadeTotalExibida || 'N/D'} | Ocupadas: {ocupacaoTotal}
             </p>
             <p className={styles.cardTextDetail}>
               Vagas Restantes: {capacidadeTotalExibida === 0 ? 'N/D' : vagasRestantesTotal}
             </p>
             <p className={styles.cardTextDetail}>
               Lucro Atual: R$ {(((caravana.vagasOcupadas || 0) * (caravana.preco || 0)) - (caravana.despesas || 0)).toFixed(2)}
             </p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default CaravanaCard;