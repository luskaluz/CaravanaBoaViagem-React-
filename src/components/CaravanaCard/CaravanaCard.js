// src/components/CaravanaCard/CaravanaCard.js
import React from 'react';
import styles from './CaravanaCard.module.css';
import translateStatus from '../translate/translate'; // Importa a função de tradução

const CaravanaCard = ({ caravana, isAdmin = false, children }) => {
  if (!caravana) {
    return <div className={styles.card}>Caravana inválida.</div>;
  }

  // --- CORREÇÃO DA DATA ---
  let dataFormatada = 'N/A';
  let dataCaravanaUTC = null;

  if (caravana.data) {
      try {
          // Adiciona 'T00:00:00Z' para interpretar a string YYYY-MM-DD como UTC
          dataCaravanaUTC = new Date(caravana.data + 'T00:00:00Z');

          // Verifica se a data é válida após a criação
          if (!isNaN(dataCaravanaUTC.getTime())) {
               // Formata usando opções para mostrar a data correta (sem hora/timezone local)
               const options = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' };
               dataFormatada = dataCaravanaUTC.toLocaleDateString('pt-BR', options);
          } else {
              console.warn("Data inválida recebida da caravana:", caravana.data);
              dataFormatada = 'Data inválida';
              dataCaravanaUTC = null; // Anula se inválida
          }
      } catch (e) {
            console.error("Erro ao processar data da caravana:", e);
            dataFormatada = 'Erro na data';
            dataCaravanaUTC = null;
      }
  }
  // --- FIM CORREÇÃO DA DATA ---


  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0); // Compara com hoje em UTC também

  // Usa a dataCaravanaUTC para comparação
  const isPast = dataCaravanaUTC && dataCaravanaUTC < hoje;
  const isCancelled = caravana.status === 'cancelada';
  const isConcluida = caravana.status === 'concluida'; // Adiciona verificação de concluída

  // Atualiza a lógica para inativar também se concluída
  const isCaravanaInativa = isCancelled || isConcluida || (caravana.status === 'confirmada' && isPast);

  const cardClassName = `${styles.card} ${
    isCaravanaInativa ? styles.caravanaInativa : ''
  }`;

    // Calcula Vagas Disponíveis (Clientes) usando a lógica centralizada
    const calcularDisponibilidade = (carav) => {
        if (!carav) return { vagasCliente: 0, capacidadeTotalExibida: 0 };
        let capacidadeBase = 0;
        let numAdminsConsiderados = 0;
        const vagasOcup = carav.vagasOcupadas || 0;
        const transporteDefinido = carav.transporteDefinidoManualmente || carav.transporteAutoDefinido;

        if (transporteDefinido) {
            capacidadeBase = carav.capacidadeFinalizada || 0;
            if (capacidadeBase > 0 && Array.isArray(carav.transportesFinalizados)) {
                numAdminsConsiderados = Math.min(capacidadeBase, carav.transportesFinalizados.length);
            }
        } else {
            capacidadeBase = carav.capacidadeMaximaTeorica || 0;
            if (capacidadeBase > 0) {
                numAdminsConsiderados = Math.min(capacidadeBase, carav.maximoTransportes || 0);
            }
        }
        const vagasDispCliente = Math.max(0, capacidadeBase - vagasOcup - numAdminsConsiderados);
        return { vagasCliente: vagasDispCliente, capacidadeTotalExibida: capacidadeBase };
    };

    const disponibilidade = calcularDisponibilidade(caravana);


  return (
    <div className={cardClassName}>
      <div className={styles.cardImageContainer}>
        {/* Usa imagemCapaLocalidade como fallback primário */}
        <img
            src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || "./images/imagem_padrao.jpg"}
            alt={`Imagem de ${caravana.nomeLocalidade || 'Caravana'}`}
            className={styles.cardImage}
            // Adiciona onError para caso a imagem principal falhe
            onError={(e) => {
                 e.target.onerror = null; // Previne loop infinito
                 // Tenta a primeira imagem da lista, se existir
                 if (caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && e.target.src !== caravana.imagensLocalidade[0]) {
                      e.target.src = caravana.imagensLocalidade[0];
                 } else { // Se não, usa a padrão
                     e.target.src = "./images/imagem_padrao.jpg";
                 }
            }}
        />
      </div>
      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>{caravana.nomeLocalidade || 'Destino Indefinido'}</h3>
        {/* Mostra a data formatada corretamente */}
        <p className={styles.cardText}>Data: {dataFormatada}</p>
        <p className={styles.cardText}>
          Horário de Saída: {caravana.horarioSaida || 'A definir'}
        </p>
        {/* Usa a função de tradução para status */}
        <p className={styles.cardText}>
          Status: {translateStatus(caravana.status)}
        </p>
        {/* Adiciona exibição de vagas disponíveis para cliente */}
         <p className={styles.cardText}>
             Vagas (Clientes): {
               disponibilidade.capacidadeTotalExibida === 0 ? 'A definir'
               : disponibilidade.vagasCliente === 0 ? 'Esgotado'
               : disponibilidade.vagasCliente
             }
         </p>

        {/* Exibição condicional para Admin */}
        {isAdmin && (
          <div className={styles.adminDetails}>
             <p className={styles.cardTextDetail}>
               Capacidade: {disponibilidade.capacidadeTotalExibida || 'N/A'} | Ocupadas: {caravana.vagasOcupadas || 0}
             </p>
             <p className={styles.cardTextDetail}>
               Lucro Atual: R$ {(((caravana.vagasOcupadas || 0) * (caravana.preco || 0)) - (caravana.despesas || 0)).toFixed(2)}
             </p>
             {/* Adicione outras métricas se necessário */}
          </div>
        )}
        {/* Renderiza os botões e outras informações passadas como children */}
        {children}
      </div>
    </div>
  );
};

export default CaravanaCard;