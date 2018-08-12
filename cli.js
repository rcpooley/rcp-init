const inquirer = require('inquirer');
const Rx = require('rxjs');
const newBabelProject = require('./newBabelProject');

const prompts = new Rx.Subject();

let resolve, reject;
function prompt(question) {
    return new Promise((res, rej) => {
        resolve = res;
        reject = rej;
        prompts.next(Object.assign({}, question, {name: 'question'}));
    });
}

inquirer.prompt(prompts).ui.process.subscribe(
    ans => resolve(ans.answer),
    err => reject(err)
);

async function main() {
    let resp = await prompt({
        type: 'list',
        message: 'What would you like to do?',
        choices: [
            {name: 'Create a new babel project', value: 'create'},
            {name: 'Quit', value: 'quit'}
        ]
    });
    if (resp === 'quit') {
        return process.exit(0);
    }

    const flow = await prompt({
        type: 'confirm',
        message: 'Do you want to use flow for type checking?'
    });

    const eslint = await prompt({
        type: 'confirm',
        message: 'Do you want to use ESLint?'
    });

    const mocha = await prompt({
        type: 'confirm',
        message: 'Do you want to use mocha & chai for testing'
    });

    const publish = await prompt({
        type: 'confirm',
        message: 'Do you plan to publish this on npm?'
    });

    const executable = await prompt({
        type: 'list',
        message: 'Does this package execute or is it imported?',
        choices: [
            {name: 'Executable', value: true},
            {name: 'Imported', value: false}
        ]
    });

    prompts.complete();

    await newBabelProject({
        flow,
        eslint,
        mocha,
        publish,
        executable
    });
}

main().catch(err => console.error(err));
