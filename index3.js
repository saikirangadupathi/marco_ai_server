const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

const app = express();
const port = 8080;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(require("cors")());

function preprocessCurlCommand(curlCommand) {
    // Remove extra backslashes and unnecessary characters
    return curlCommand
        .replace(/\\n/g, '') // Remove newlines
        .replace(/\\"/g, '"') // Unescape double quotes
        .replace(/\\r\\n/g, '') // Remove carriage returns and newlines
        .replace(/\s+/g, ' ') // Remove extra whitespace
        .trim();
}

// Load the `curlconverter` library dynamically
async function loadCurlConverter() {
    const curlconverter = await import('curlconverter');
    return curlconverter;
}
  
const parseCurlCommand = async (curlCommand) => {
    const { toJsonString } = await loadCurlConverter();
    const cleanedCommand = preprocessCurlCommand(curlCommand);
    let axiosConfigJson = toJsonString(cleanedCommand);
    let axiosConfig = JSON.parse(axiosConfigJson);

    axiosConfig.method = axiosConfig.method || 'GET';
    axiosConfig.headers = axiosConfig.headers || {};

    if (axiosConfig.data && typeof axiosConfig.data === 'string') {
        try {
            // Correctly format the JSON data
            axiosConfig.data = axiosConfig.data
                .replace(/(\w+):/g, '"$1":') // Add quotes around keys
                .replace(/"(?:[^"\\]|\\.)*"/g, (match) => match.replace(/(\w+):(\d+\.?\d*)/g, '"$1":$2')) // Add quotes around keys with numbers
                .replace(/,(\s*})/g, '$1') // Remove trailing commas
                .replace(/,(\s*])/g, '$1') // Remove trailing commas in arrays

            // Ensure keys and values are in double quotes
            axiosConfig.data = JSON.parse(axiosConfig.data);
        } catch (err) {
            console.error('Failed to parse JSON data:', err.message);
        }
    }

    console.log("Parsed cURL Object:", JSON.stringify(axiosConfig, null, 2)); // Log the parsed cURL object

    return axiosConfig;
};


async function makeRequest(curlCommand) {
    try {
        const config = await parseCurlCommand(curlCommand);
        const response = await axios(config);
        console.log('Response:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Error Response:', error.response.data);
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
        } else if (error.request) {
            console.error('Error Request:', error.request);
        } else {
            console.error('Error Message:', error.message);
        }
    }
}


const flattenKeys = (obj) => {
    let keysWithTypes = {};

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            let formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
            const value = obj[key];

            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    keysWithTypes[formattedKey] = 'array';
                    if (value.length > 0 && typeof value[0] === 'object') {
                        keysWithTypes = { ...keysWithTypes, ...flattenKeys(value[0]) };
                    }
                } else {
                    keysWithTypes = { ...keysWithTypes, ...flattenKeys(value) };
                }
            } else {
                keysWithTypes[formattedKey] = typeof value;
            }
        }
    }

    return keysWithTypes;
};




const analyzeSchema = async (keysWithTypes) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are given a list of API response structures with their data types. Based on these structures, generate a canonical schema where each key is prefixed with 'Mobius_PI_' and mapped to the corresponding data type. Ensure that the keys are flattened and formatted to be human-readable.

                    Here is the list of keys and their types: ${JSON.stringify(keysWithTypes)}.

                    Example of the expected output:
                    {
                        'Mobius_PI_DirectTime": 'string',
                        'Mobius_PI_DirectProductType': 'string',
                        'Mobius_PI_DirectUserType': 'string',
                        'Mobius_PI_DirectAvgCost': 'number',
                        'Mobius_PI_DirectStorageGrowth': 'number',
                        'Mobius_PI_DirectCostFluctuation': 'boolean'
                    }`
                }
            ]
        });



        

        const messageContent = response.choices[0].message.content.trim();

        try {
            return JSON.parse(messageContent);
        } catch (e) {
            console.error("Failed to parse JSON. Returning raw message content:", messageContent);
            return { rawResponse: messageContent };
        }
    } catch (error) {
        console.error("Error analyzing schema:", error);
        return null;
    }
};

// ai to create schema .................


const Createschema = async (json, entityName, primaryKey) => {
    try {
        const response = await axios.post({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are an AI that converts JSON into a predefined schema structure. Ensure that nested objects are correctly parsed and included as child attributes within the schema."
                },
                {
                    role: "user",
                    content: `Based on the following JSON input, generate a schema with the provided entityName and primaryKey, where each key is converted into an attribute within the 'attributes' array of the schema structure. If a key contains nested objects, treat it as a 'json' type and include its properties as 'childAttributes'. Follow this structure:
                    {
                        "entityName": "${entityName}",
                        "description": "${entityName}",
                        "schemaReadAccess": "PUBLIC",
                        "dataReadAccess": "PUBLIC",
                        "dataWriteAccess": "PUBLIC",
                        "metadataReadAccess": "PUBLIC",
                        "metadataWriteAccess": "PUBLIC",
                        "universes": ["66c5e12556baea79392a88ea"],
                        "tags": {"BLUE": []},
                        "attributes": [
                            {
                                "name": "KeyName",
                                "nestedName": "KeyName",
                                "type": {"type": "DataType"},
                                "required": false,
                                "reference": false,
                                "videos": [],
                                "childAttributes": []
                            }
                        ],
                        "primaryKey": ["${primaryKey}"],
                        "execute": "PUBLIC",
                        "visibility": "PUBLIC"
                    }. 

                    JSON Input: ${JSON.stringify(json)}`
                }
            ]
        });

        const messageContent = response.data.choices[0].message.content.trim();

        try {
            return JSON.parse(messageContent);
        } catch (e) {
            console.error("Failed to parse JSON. Returning raw message content:", messageContent);
            return { rawResponse: messageContent };
        }
    } catch (error) {
        console.error("Error creating schema:", error.message || error);
        return { error: "An error occurred while creating the schema. Please check the input and try again." };
    }
};





app.post('/api/run-curl-agent', async (req, res) => {
    try {
        const curlCommands = req.body.curlCommands;

        const responses = await Promise.all(
            curlCommands.map(async (curlCommand) => {
                const parsedCurl = await parseCurlCommand(curlCommand);

                const response = await axios(parsedCurl);

                return response.data;
            })
        );

        const allKeysWithTypes = responses.reduce((acc, response) => {
            const keysWithTypes = flattenKeys(response);
            return { ...acc, ...keysWithTypes };
        }, {});

        const refinedSchema = await analyzeSchema(allKeysWithTypes);





        res.json({ result: refinedSchema});
    } catch (err) {
        console.error("Error running curl agent:", err.message);
        res.status(500).json({ error: err.message });
    }
});










app.post('/api/map-keys', async (req, res) => {
    const { apiKeys, canonicalKeys } = req.body;

    const updatedKeys = apiKeys.map(key => key.replace('[0]', ''));


    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant that maps API keys to a canonical schema format. Please provide the mappings in JSON format with the following structure: [{ "apiKey": "string", "canonicalKey": "string" }, ...].`
                },
                {
                    role: "user",
                    content: `Here are the API keys:\n${updatedKeys.join('\n')}\n\nAnd here are the canonical keys:\n${canonicalKeys.join('\n')}\n\nPlease generate the mappings in the format specified.`
                }
            ]
        });

        let aiMappingSuggestions = response.choices[0].message.content.trim();

        const jsonStartIndex = aiMappingSuggestions.indexOf('[');
        const jsonEndIndex = aiMappingSuggestions.lastIndexOf(']') + 1;

        if (jsonStartIndex === -1 || jsonEndIndex === -1) {
            throw new Error('No JSON array found in AI response');
        }

        aiMappingSuggestions = aiMappingSuggestions.slice(jsonStartIndex, jsonEndIndex);

        let mappings;
        try {
            mappings = JSON.parse(aiMappingSuggestions);
        } catch (parseError) {
            console.error("Error parsing AI response:", parseError);
            return res.status(500).json({ error: 'Failed to parse AI response as JSON.' });
        }

        res.json({ mappings });
    } catch (error) {
        console.error("Error generating mappings:", error);
        res.status(500).json({ error: 'Failed to generate mappings.' });
    }
});



app.post('/api/run-curl', async (req, res) => {
    const { curlCommands } = req.body;

    try {
        const responses = await Promise.all(
            curlCommands.map(async (command) => {
                const config = await parseCurlCommand(command);

                const response = await axios(config);
                return response.data;
            })
        );

        res.json({ result: responses });
    } catch (error) {
        console.error("Error executing cURL commands:", error.message);
        res.status(500).json({ error: 'Failed to execute cURL commands.' });
    }
});




















app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
