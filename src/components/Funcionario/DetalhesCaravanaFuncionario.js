import React, { useState, useEffect } from 'react';
// Mantém o import do CSS do usuário para consistência visual
import styles from '../Usuario/DetalhesCaravanaUsuario.module.css'; // Ajuste o caminho se necessário
import * as api from '../../services/api';

const PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/80x120?text=Foto";

// Remove 'onClose' das props
function DetalhesCaravanaFuncionario({ caravana }) {
    const [descricao, setDescricao] = useState('');
    const [isLoadingDesc, setIsLoadingDesc] = useState(false);

    useEffect(() => {
        const fetchDescricao = async () => {
            if (caravana && caravana.localidadeId) {
                setIsLoadingDesc(true);
                try {
                    const descricaoData = await api.getDescricaoLocalidade(caravana.localidadeId);
                    setDescricao(descricaoData.descricao || '');
                } catch (err) { console.error(err); setDescricao('Erro ao carregar.');}
                finally { setIsLoadingDesc(false); }
            } else { setDescricao('N/A'); }
        };
        fetchDescricao();
    }, [caravana]);

    // --- ADICIONADO DE VOLTA ---
    const formatStatus = (status) => {
        switch (status) {
            case 'confirmada': return 'Confirmada';
            case 'nao_confirmada': return 'Não Confirmada';
            case 'cancelada': return 'Cancelada';
            case 'concluida': return 'Concluída';
            default: return 'Desconhecido';
        }
    };
    // --- FIM ADIÇÃO ---

    const EmployeeInfoDetailed = ({ employee, role }) => {
        if (!employee) {
            return (
                 <div className={`${styles.employeeBlock} ${styles.employeeNotConfirmed}`}>
                    <div className={styles.employeeDetails}>
                        <p className={styles.infoStrong}><strong>{role}:</strong> Não Confirmado</p>
                    </div>
                 </div>
            );
        }
        if (employee.error) {
            return (
                 <div className={styles.employeeBlock}>
                    <img src={PLACEHOLDER_IMAGE_URL} alt={role} className={styles.employeePhoto}/>
                    <div className={styles.employeeDetails}>
                         <p className={styles.infoStrong}><strong>{role}:</strong> Erro ao carregar</p>
                    </div>
                 </div>
            );
         }
        return (
            <div className={styles.employeeBlock}>
                <img src={employee.fotoUrl || PLACEHOLDER_IMAGE_URL} alt={employee.nome || role} className={styles.employeePhoto} onError={(e) => { e.target.onerror = null; e.target.src=PLACEHOLDER_IMAGE_URL }}/>
                <div className={styles.employeeDetails}>
                    <p className={styles.infoStrong}><strong>{role}:</strong> {employee.nome || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Email:</strong> {employee.email || 'N/A'}</p>
                    <p className={styles.infoSmall}><strong>Telefone:</strong> {employee.telefone || 'N/A'}</p>
                </div>
            </div>
        );
    };

    if (!caravana) return null;

    const vagasOcupadas = caravana.vagasOcupadas || 0;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Detalhes da Caravana</h2>
            {caravana.imagensLocalidade && caravana.imagensLocalidade.length > 0 && (
                <img src={caravana.imagensLocalidade[0]} alt={caravana.nomeLocalidade || 'Localidade'} className={styles.image} />
            )}
            <p className={styles.infoItem}><strong>Localidade:</strong> {caravana.nomeLocalidade || 'N/A'}</p>
            <p className={styles.infoItem}><strong>Data: </strong>{caravana.data ? new Date(caravana.data).toLocaleDateString() : 'N/A'}</p>
            <p className={styles.infoItem}><strong>Horário de Saída: </strong> {caravana.horarioSaida || 'A definir'}</p>
            {/* Status agora usa a função definida */}
            <p className={styles.infoItem}><strong>Status:</strong> {formatStatus(caravana.status)}</p>

            <div className={styles.infoSection}>
                 <h3>Descrição da Localidade</h3>
                {isLoadingDesc ? <p>Carregando...</p> : <p className={styles.descricao}>{descricao || 'Sem descrição disponível.'}</p>}
            </div>

            <div className={styles.infoSection}>
                <h3>Equipe Responsável</h3>
                <EmployeeInfoDetailed employee={caravana.administrador} role="Administrador" />
                <EmployeeInfoDetailed employee={caravana.motorista} role="Motorista" />
                <EmployeeInfoDetailed employee={caravana.guia} role="Guia" />
            </div>

             <div className={styles.infoSection}>
                <h3>Participantes e Vagas (Visão Funcionário)</h3>
                <p className={styles.infoItem}><strong>Participantes Atuais:</strong> {vagasOcupadas}</p>
                <p className={styles.infoItem}><strong>Vagas Totais:</strong> {caravana.vagasTotais || 0}</p>
                <p className={styles.infoItem}><strong>Vagas Disponíveis:</strong> {caravana.vagasDisponiveis ?? 'N/A'}</p>
                <p className={styles.infoItem}><strong>Preço por Ingresso:</strong> R$ {(caravana.preco || 0).toFixed(2)}</p>
            </div>
        </div>
    );
}

export default DetalhesCaravanaFuncionario;