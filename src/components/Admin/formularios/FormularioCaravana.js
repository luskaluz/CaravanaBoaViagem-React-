import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../../services/api';
import styles from './FormularioCaravana.module.css';

function FormularioCaravana({ caravana, onSalvar, onCancelar, localidadeId: propLocalidadeId }) {
    const [localidadeId, setLocalidadeId] = useState('');
    const [data, setData] = useState('');
    const [horarioSaida, setHorarioSaida] = useState('');
    const [vagasTotais, setVagasTotais] = useState('');
    const [despesas, setDespesas] = useState('');
    const [lucroAbsoluto, setLucroAbsoluto] = useState('');
    const [ocupacaoMinima, setOcupacaoMinima] = useState('');
    const [localidades, setLocalidades] = useState([]);
    const [nomeAdministrador, setNomeAdministrador] = useState('');
    const [emailAdministrador, setEmailAdministrador] = useState('');
    const [telefoneAdministrador, setTelefoneAdministrador] = useState('');
    const [error, setError] = useState(null);


    const precoCalculado = useMemo(() => {
        if (despesas && lucroAbsoluto && ocupacaoMinima && vagasTotais) {
            const despesasNum = parseFloat(despesas);
            const lucroAbsolutoNum = parseFloat(lucroAbsoluto);
            const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10);
            const vagasTotaisNum = parseInt(vagasTotais, 10);

            if (ocupacaoMinimaNum <= 0 || ocupacaoMinimaNum > vagasTotaisNum) {
                return 0;
            }

            if (ocupacaoMinimaNum > 0) {
                const preco = (despesasNum + lucroAbsolutoNum) / ocupacaoMinimaNum;
                return Math.ceil(preco);
            }
        }
        return 0;
    }, [despesas, lucroAbsoluto, ocupacaoMinima, vagasTotais]);

    const { lucroMaximoCalculado, roiCalculado, roiCalculadoMinimo } = useMemo(() => { // Adicionado roiCalculadoMinimo
        let lucroMax = 0;
        let roi = 0;
        let roiMinimo = 0; // Inicializa roiMinimo

        if (despesas && vagasTotais && precoCalculado) {
            const despesasNum = parseFloat(despesas);
            const vagasTotaisNum = parseInt(vagasTotais, 10);
            const precoNum = parseFloat(precoCalculado);

            if (vagasTotaisNum > 0) {
                lucroMax = (precoNum * vagasTotaisNum) - despesasNum;
                roi = despesasNum > 0 ? (lucroMax / despesasNum) * 100 : 0;
            }
        }
          if (despesas && ocupacaoMinima && precoCalculado) { // Calcula ROI mínimo
                const despesasNum = parseFloat(despesas);
                const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10);
                const precoNum = parseFloat(precoCalculado)

                if(ocupacaoMinimaNum > 0){
                  const lucroMinimo = (precoNum * ocupacaoMinimaNum) - despesasNum;
                  roiMinimo = despesasNum > 0 ? (lucroMinimo / despesasNum) * 100 : 0;
                }
            }

        return { lucroMaximoCalculado: lucroMax, roiCalculado: roi, roiCalculadoMinimo: roiMinimo }; // Retorna roiCalculadoMinimo
    }, [despesas, vagasTotais, precoCalculado, ocupacaoMinima]); // Adicionado ocupacaoMinima


    useEffect(() => {
        const carregarDados = async () => {
            try {
                const localidadesData = await api.getLocalidades();
                setLocalidades(localidadesData);

                if (caravana) {
                    // Formata a data ao CARREGAR (importante!)

                    setLocalidadeId(caravana.localidadeId || '');
                     //Ajuste na data
                   setData(caravana.data ? formatarDataISO(new Date(caravana.data)) : '');
                    setHorarioSaida(caravana.horarioSaida || '');
                    setVagasTotais(caravana.vagasTotais || '');
                    setDespesas(caravana.despesas || '');
                    setLucroAbsoluto(caravana.lucroAbsoluto || '');
                    setOcupacaoMinima(caravana.ocupacaoMinima || '');
                    setNomeAdministrador(caravana.nomeAdministrador || '');
                    setEmailAdministrador(caravana.emailAdministrador || '');
                    setTelefoneAdministrador(caravana.telefoneAdministrador || '');
                } else if (propLocalidadeId) {
                    setLocalidadeId(propLocalidadeId);
                }
            } catch (error) {
                setError(error.message);
                console.error("Erro ao carregar dados:", error)
            }
        };

        carregarDados();
    }, [caravana, propLocalidadeId]);


    // Função para formatar a data (YYYY-MM-DD)
    const formatarDataISO = (date) => {
        if (!date) return ''; // Se a data for nula/undefined, retorna vazio
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Adiciona zero à esquerda
        const day = String(date.getDate()).padStart(2, '0');        // Adiciona zero à esquerda
        return `${year}-${month}-${day}`;
    };


   const handleSubmit = async (event) => {
        event.preventDefault();
          if (!localidadeId || !data || !vagasTotais || !despesas || !lucroAbsoluto || !ocupacaoMinima || !nomeAdministrador || !emailAdministrador || !telefoneAdministrador) {
            setError("Preencha todos os campos obrigatórios.");
            return;
        }
        const ocupacaoMinimaNum = parseInt(ocupacaoMinima, 10);
        const vagasTotaisNum = parseInt(vagasTotais, 10);

         if (ocupacaoMinimaNum <= 0 || ocupacaoMinimaNum > vagasTotaisNum) {
            setError("A ocupação mínima deve ser maior que zero e menor ou igual ao número total de vagas.");
            return;
        }
        const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(telefoneAdministrador)) {
              setError("Formato de telefone do administrador inválido. Use apenas números (10 ou 11 dígitos).");
             return;
        }

        //Usa a data ja formatada
        const caravanaData = {

            localidadeId,
            data, // Já está no formato YYYY-MM-DD
            horarioSaida,
            vagasTotais: parseInt(vagasTotais, 10),
            vagasDisponiveis: parseInt(vagasTotais, 10),
            despesas: parseFloat(despesas),
            lucroAbsoluto: parseFloat(lucroAbsoluto),
           ocupacaoMinima: parseInt(ocupacaoMinima, 10),
            preco: precoCalculado,
            nomeAdministrador,
            emailAdministrador,
           telefoneAdministrador,
       };


      try {
            setError(null);

           if (caravana) {
                await api.updateCaravana(caravana.id, caravanaData);
              onSalvar();

            } else {
                await api.createCaravana(caravanaData);
              onSalvar();

            }

        } catch (error) {
           setError(error.message);

        }
};


    return (
       <div className={styles.container}>
            <div className={styles.modalContent}>
                {error && <div className={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit} className={styles.form}>
                    <label htmlFor="localidade">Localidade:</label>
                    <select
                        id="localidade"
                        name="localidadeId"
                        value={localidadeId}
                        onChange={(e) => {
                            setLocalidadeId(e.target.value);
                        }}
                        className={styles.select}
                        disabled={!!propLocalidadeId}
                    >
                        <option value="">Selecione uma localidade</option>
                        {localidades.map((localidade) => (
                            <option key={localidade.id} value={localidade.id}>
                                {localidade.nome}
                            </option>
                        ))}
                    </select>


                    <label htmlFor="data">Data:</label>
                    <input
                        type="date"
                        id="data"
                        name="data"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="horarioSaida">Horário de Saída:</label>
                    <input
                        type="time"
                        id="horarioSaida"
                         name="horarioSaida"
                        value={horarioSaida}
                        onChange={(e) => setHorarioSaida(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="vagasTotais">Vagas Totais:</label>
                    <input
                        type="number"
                        id="vagasTotais"
                         name="vagasTotais"
                        value={vagasTotais}
                        onChange={(e) => setVagasTotais(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="despesas">Despesas em reais (estimadas):</label>
                    <input
                        type="number"
                        id="despesas"
                         name="despesas"
                        value={despesas}
                        onChange={(e) => setDespesas(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="ocupacaoMinima">Ocupação Mínima (absoluta):</label>
                    <input
                        type="number"
                        id="ocupacaoMinima"
                        name="ocupacaoMinima"
                        value={ocupacaoMinima}
                        onChange={(e) => setOcupacaoMinima(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="lucroAbsoluto">Lucro Desejado minimo (absoluto em reais):</label>
                    <input
                        type="number"
                        id="lucroAbsoluto"
                         name="lucroAbsoluto"
                        value={lucroAbsoluto}
                        onChange={(e) => setLucroAbsoluto(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="precoPorPessoa">Preço do Ingresso:</label>
                    <input
                        type="text"
                        id="precoPorPessoa"
                        name="precoPorPessoa"
                        value={`R$ ${precoCalculado}`}
                        readOnly
                        className={styles.input}
                    />
                    <label htmlFor="lucroMaximo">Lucro Máximo (100% de ocupação):</label>
                    <input
                        type="text"
                        id="lucroMaximo"
                        name="lucroMaximo"
                         value={`R$ ${lucroMaximoCalculado.toFixed(2)}`}
                        readOnly
                        className={styles.input}
                    />

                    <label htmlFor="retornoSobreInvestimentoMinimo">Retorno Sobre Investimento Mínimo (ROI):</label>
                    <input
                        type="text"
                        id="retornoSobreInvestimentoMinimo"  //  Corrigido: ID único
                        name="retornoSobreInvestimentoMinimo"
                        value={`${roiCalculadoMinimo.toFixed(2)}%`}  //  Usa roiCalculadoMinimo
                        readOnly
                        className={styles.input}
                    />

                    <label htmlFor="retornoSobreInvestimento">Retorno Sobre Investimento Máximo (ROI):</label>
                    <input
                        type="text"
                        id="retornoSobreInvestimento"
                        name="retornoSobreInvestimento"
                        value={`${roiCalculado.toFixed(2)}%`}
                        readOnly
                        className={styles.input}
                    />

                      <label htmlFor="nomeAdministrador">Nome do Administrador:</label>
                    <input
                        type="text"
                        id="nomeAdministrador"
                        name="nomeAdministrador"
                        value={nomeAdministrador}
                        onChange={(e) => setNomeAdministrador(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="emailAdministrador">Email do Administrador:</label>
                    <input
                        type="email"
                        id="emailAdministrador"
                        name="emailAdministrador"
                        value={emailAdministrador}
                        onChange={(e) => setEmailAdministrador(e.target.value)}
                        className={styles.input}
                    />

                    <label htmlFor="telefoneAdministrador">Telefone do Administrador:</label>
                    <input
                        type="tel"
                        id="telefoneAdministrador"
                        name="telefoneAdministrador"
                        value={telefoneAdministrador}
                        onChange={(e) => setTelefoneAdministrador(e.target.value)}
                        className={styles.input}
                    />

                    <div className={styles.buttonGroup}>
                        <button type="submit" className={styles.saveButton}>Salvar</button>
                        <button type="button" onClick={onCancelar} className={styles.cancelButton}>
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default FormularioCaravana;
