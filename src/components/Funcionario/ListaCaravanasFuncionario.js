import React from 'react';
import styles from './ListaCaravanasFuncionario.module.css';

// Assume que recebe funcionarioLogado de um componente pai (Dashboard)
function ListaCaravanasFuncionario({ caravanas, onCaravanaClick, onParticipantesClick, funcionarioLogado }) {

    const handleVerParticipantes = (event, caravanaId) => {
        event.stopPropagation();
        if (!funcionarioLogado) {
            console.error("Dados do funcionário logado não disponíveis.");
            // Idealmente, mostrar um erro para o usuário
            return;
        }
        // Passa caravanaId, uid e cargo para o handler no componente pai
        onParticipantesClick(caravanaId, funcionarioLogado.uid, funcionarioLogado.cargo);
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
                    const cardClass = `${styles.card} ${isPast || isCancelled ? styles.caravanaInativa : ''}`;

                    // Determina se o botão de participantes deve ser mostrado para este funcionário
                    // Guia sempre vê. Admin/Motorista só vê se o transporte foi definido.
                    const podeVerParticipantes = true;

                    return (
                        <div key={caravana.id} className={cardClass} >
                            <img
                                src={caravana.imagemCapaLocalidade || caravana.imagensLocalidade?.[0] || './images/imagem_padrao.jpg'}
                                alt={caravana.nomeLocalidade}
                                className={styles.image}
                            />
                            <h3 className={styles.cardTitle}>{caravana.nomeLocalidade}</h3>
                            <p className={styles.cardDate}>
                                Data: {new Date(caravana.data + 'T00:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </p>
                            <p className={styles.cardTime}>
                                Horário de Saída: {caravana.horarioSaida || 'A definir'}
                            </p>

                            <button
                                className={styles.detailsButton}
                                onClick={() => onCaravanaClick(caravana)} // Assume que onCaravanaClick abre detalhes gerais
                            >
                                Ver Detalhes
                            </button>

                            {podeVerParticipantes && (
                                <button
                                    className={styles.participantesButton}
                                    onClick={(event) => handleVerParticipantes(event, caravana.id)}
                                >
                                    Ver Participantes
                                </button>
                            )}
                        </div>
                    );
                }))}
        </div>
    );
}

export default ListaCaravanasFuncionario;