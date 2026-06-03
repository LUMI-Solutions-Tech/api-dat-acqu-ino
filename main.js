const serialport = require("serialport");
const express = require("express");
const mysql = require("mysql2");

const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

const HABILITAR_OPERACAO_INSERIR = true;

const FATOR_LUX_PARA_PPFD = 0.0185;

// Gera uma pequena variação aleatória
function variacao(valor, porcentagem) {
  const fator = 1 + (Math.random() * porcentagem * 2 - porcentagem) / 100;

  return valor * fator;
}

const serial = async (valoresSensorLuminosidade) => {
  const poolBancoDados = mysql
    .createPool({
      host: "localhost",
      user: "root",
      password: "root",
      database: "lumi_sprint_3",
      port: 3306,
    })
    .promise();

  // Teste da conexão com o banco
  try {
    const conexao = await poolBancoDados.getConnection();
    console.log("BANCO CONECTADO COM SUCESSO");
    conexao.release();
  } catch (erro) {
    console.error("ERRO AO CONECTAR NO MYSQL:");
    console.error(erro);
    return;
  }

  const portas = await serialport.SerialPort.list();

  const portaArduino = portas.find(
    (porta) => porta.vendorId == 2341 || porta.vendorId == "2341",
  );

  if (!portaArduino) {
    throw new Error("O arduino não foi encontrado em nenhuma porta serial");
  }

  const arduino = new serialport.SerialPort({
    path: portaArduino.path,
    baudRate: SERIAL_BAUD_RATE,
  });

  arduino.on("open", () => {
    console.log(
      `Leitura iniciada na porta ${portaArduino.path} utilizando Baud Rate ${SERIAL_BAUD_RATE}`,
    );
  });

  arduino
    .pipe(new serialport.ReadlineParser({ delimiter: "\r\n" }))
    .on("data", async (data) => {
      try {
        console.log("Valor recebido:", data);

        const valorAnalogico = parseFloat(data);

        if (isNaN(valorAnalogico)) {
          console.log("Valor inválido recebido.");
          return;
        }

        // Simulação de 4 sensores
        const sensores = [
          { id: 1, lux: valorAnalogico * 18 + Math.random() * 50 },
          { id: 2, lux: valorAnalogico * 32 + Math.random() * 50 },
          { id: 3, lux: valorAnalogico * 17 + Math.random() * 50 },
          { id: 4, lux: valorAnalogico * 16 + Math.random() * 50 },
        ];

        let proximoId = 1;

        if (HABILITAR_OPERACAO_INSERIR) {
          const [resultado] = await poolBancoDados.execute(
            `SELECT COALESCE(MAX(idLeituras), 0) AS ultimoId
             FROM Leituras`,
          );

          proximoId = resultado[0].ultimoId + 1;
        }

        for (const sensor of sensores) {
          const lux = Number(sensor.lux.toFixed(2));
          const ppfd = Number((lux * FATOR_LUX_PARA_PPFD).toFixed(2));
          const dli = Number((ppfd / 18).toFixed(1));

          valoresSensorLuminosidade.push({
            idLeitura: proximoId,
            fkSensor: sensor.id,
            lux,
            ppfd,
            dli,
            dataHora: new Date(),
          });

          if (valoresSensorLuminosidade.length > 100) {
            valoresSensorLuminosidade.shift();
          }

          if (HABILITAR_OPERACAO_INSERIR) {
            await poolBancoDados.execute(
              `INSERT INTO Leituras (idLeituras, fkSensor, lux, ppfd, dli, dataHora) 
                VALUES (?, ?, ?, ?, ?, NOW())`,
              [proximoId, sensor.id, Math.round(lux), Math.round(ppfd), dli], 
            );

            console.log(
              `Leitura ${proximoId} | Sensor ${sensor.id} | Lux ${lux} | PPFD ${ppfd} | DLI ${dli}`,
            );

            proximoId++;
          }
        }
      } catch (erro) {
        console.error("Erro ao processar leitura:");
        console.error(erro);
      }
    });

  arduino.on("error", (erro) => {
    console.error("Erro no Arduino:", erro.message);
  });
};

const servidor = (valoresSensorLuminosidade) => {
  const app = express();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
    next();
  });

  app.listen(SERVIDOR_PORTA, () => {
    console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
  });

  app.get("/sensores/analogico", (_, response) => {
    response.json(valoresSensorLuminosidade);
  });
};

(async () => {
  const valoresSensorLuminosidade = [];

  await serial(valoresSensorLuminosidade);

  servidor(valoresSensorLuminosidade);
})();
