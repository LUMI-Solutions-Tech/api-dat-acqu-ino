// importa as bibliotecas necessárias
const serialport = require("serialport");
const express = require("express");
const mysql = require("mysql2");

// constantes para configurações
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

// habilita ou desabilita a inserção de dados no banco de dados
const HABILITAR_OPERACAO_INSERIR = true;

// fator de conversão para PPFD
const FATOR_LUX_PARA_PPFD = 0.0185;

// ID do sensor cadastrado no banco
const ID_SENSOR = 1;

// função para comunicação serial
const serial = async (valoresSensorLuminosidade) => {
  // conexão com o banco de dados MySQL
  let poolBancoDados = mysql
    .createPool({
      host: "localhost",
      user: "lumi_insert",
      password: "Lumiinsert@2026",
      database: "sistema_lumi",
      port: 3307,
    })
    .promise();

  // lista as portas seriais disponíveis e procura pelo Arduino
  const portas = await serialport.SerialPort.list();
  const portaArduino = portas.find(
    (porta) => porta.vendorId == 2341 && porta.productId == 43,
  );
  if (!portaArduino) {
    throw new Error("O arduino não foi encontrado em nenhuma porta serial");
  }

  // configura a porta serial com o baud rate especificado
  const arduino = new serialport.SerialPort({
    path: portaArduino.path,
    baudRate: SERIAL_BAUD_RATE,
  });

  // evento quando a porta serial é aberta
  arduino.on("open", () => {
    console.log(
      `A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`,
    );
  });

  // processa os dados recebidos do Arduino
  arduino
    .pipe(new serialport.ReadlineParser({ delimiter: "\r\n" }))
    .on("data", async (data) => {
      console.log(data);
      // Antes: const valorAnalogico = parseFloat(data.split(':')[1]);
      const valorAnalogico = parseFloat(data); // Captura o número diretamente

      // calcula o PPFD com base no valor analógico
      const ppfd = valorAnalogico * FATOR_LUX_PARA_PPFD; 7
      const ppfdFormatado = ppfd.toFixed(2)

      // armazena os valores do sensor no array
      valoresSensorLuminosidade.push({
        valorAnalogico: valorAnalogico,
        ppfd: ppfd,
        dataHora: new Date(),
      });

      // insere os dados no banco de dados (se habilitado)
      if (HABILITAR_OPERACAO_INSERIR) {
        await poolBancoDados.execute(
          "INSERT INTO Leituras (fkSensor, lux, ppfd, dataHora) VALUES (?, ?, ?, NOW())",
          [ID_SENSOR, valorAnalogico, ppfdFormatado],
        );
        console.log(
          "valores inseridos no banco: ",
          valorAnalogico + ", " + ppfdFormatado,
        );
      }
    });

  // evento para lidar com erros na comunicação serial
  arduino.on("error", (mensagem) => {
    console.error(`Erro no arduino (Mensagem: ${mensagem}`);
  });
};

// função para criar e configurar o servidor web
const servidor = (valoresSensorLuminosidade) => {
  const app = express();

  // configurações de requisição e resposta
    app.use((request, response, next) => {
        response.header('Access-Control-Allow-Origin', '*');
        response.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
        next();
    });

  // inicia o servidor na porta especificada
  app.listen(SERVIDOR_PORTA, () => {
    console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
  });

  // define o endpoint da API
  app.get("/sensores/analogico", (_, response) => {
    return response.json(valoresSensorLuminosidade);
  });
};

// função principal assíncrona para iniciar a comunicação serial e o servidor web
(async () => {
  // array para armazenar os valores do sensor
  const valoresSensorLuminosidade = [];

  // inicia a comunicação serial
  await serial(valoresSensorLuminosidade);

  // inicia o servidor web
  servidor(valoresSensorLuminosidade);
})();
