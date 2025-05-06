// ListaCaravanasFuncionario.js (Revisão da parte relevante)
import React from 'react';
import styles from './ListaCaravanasFuncionario.module.css';
// Importe ModalParticipantes se for abrir diretamente aqui, ou o handler do pai cuidará
// import ModalParticipantes from '../modal/Participantes';

function ListaCaravanasFuncionario({ caravanas, onCaravanaClick, onParticipantesClick, funcionarioLogado }) {

    const handleVerParticipantes = (event, caravanaId) => {
        event.stopPropagation();
        // Para que o funcionário veja a lista completa como admin, passamos null para funcionarioUid e cargo
        onParticipantesClick(caravanaId, null, null);
    };

    return (
        <div className={styles.cardContainer}>
            {caravanas.length === 0 ? (
                <div className={styles.containerMensagem}>
                    <p>Você não está atribuído a nenhuma caravana ativa no momento.</p>
                </div>
            ) : (
                caravanas.map((caravana) => {
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const dataCaravana = new Date(caravana.data + 'T00:00:00Z');
                    const isPast = dataCaravana < hoje;
                    const isCancelled = caravana.status === 'cancelada';
                    const isConcluida = caravana.status === 'concluida';
                    const cardClass = `${styles.card} ${isPast || isCancelled || isConcluida ? styles.caravanaInativa : ''}`;

                    const transporteJaDefinido = caravana.transporteDefinidoManualmente || caravana.transporteAutoDefinido;

                    return (
                        <div key={caravana.id} className={cardClass} onClick={() => onCaravanaClick(caravana)}>
                            <img
                                src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || './images/imagem_padrao.jpg'}
                                alt={caravana.nomeLocalidade}
                                className={styles.image}
                                onError={(e) => { e.target.onerror = null; e.target.src="./images/imagem_padrao.jpg" }}
                            />
                            <h3 className={styles.cardTitle}>{caravana.nomeLocalidade}</h3>
                            <p className={styles.cardDate}>
                                Data: {new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </p>
                            <p className={styles.cardTime}>
                                Horário de Saída: {caravana.horarioSaida || 'A definir'}
                            </p>
                            <div className={styles.buttonArea}>
                                <button
                                    className={styles.detailsButton}
                                    onClick={(e) => { e.stopPropagation(); onCaravanaClick(caravana);}}
                                >
                                    Ver Detalhes
                                </button>
                                {transporteJaDefinido && (
                                    <button
                                        className={styles.participantesButton}
                                        onClick={(event) => handleVerParticipantes(event, caravana.id)}
                                    >
                                        Ver Lista de Passageiros
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                }))}
        </div>
    );
}

export default ListaCaravanasFuncionario;