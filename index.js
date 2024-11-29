#!/usr/bin/env node

import { Command } from 'commander';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import readline from 'readline';

const program = new Command();

const PEAK_TARGET = -1; // Target peak level (dBFS)
const GATE_TARGET = -180; // Target gate level (dBFS)

program
	.version('1.0.0')
	.description('AUTOAUDIO: Trim and normalize audio files')
	.argument('<input>', 'Input folder')
	.argument('<output>', 'Output folder')
	.option(
		'--threshold <dB>',
		`Silence threshold in dB (default: ${GATE_TARGET})`,
		`${GATE_TARGET}`,
	)
	.option(
		'--duration <seconds>',
		'Silence duration to detect (default: 0.5)',
		'0.5',
	)
	.parse(process.argv);

const args = program.args;
const options = program.opts();

// extract options into vars
const inputFolder = args[0];
const outputFolder = args[1];
const silenceThreshold = options.threshold;
const silenceDuration = options.duration;

// create output folder if it doesn't exist
if (!fs.existsSync(outputFolder)) {
	fs.mkdirSync(outputFolder, { recursive: true });
	console.log(chalk.green(`Created output folder: ${outputFolder}`));
}

// if output file already exists, prompt for confirmation
const promptOverwrite = (filename) =>
	new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question(
			chalk.yellow(
				`${filename} already exists. Proceed with overwriting? [y/n] `,
			),
			(answer) => {
				rl.close();
				resolve(answer.toLowerCase() === 'y' || answer === '');
			},
		);
	});

const processAudioFile = async (file, inputPath, outputPath) => {
	console.log(chalk.blue(`Analyzing file: ${file}`));

	// check if output file already exists
	if (fs.existsSync(outputPath)) {
		const overwrite = await promptOverwrite(file);
		if (!overwrite) {
			console.log(chalk.yellow(`Skipping file: ${file}`));
			return;
		}

		// if overwriting, delete existing output file
		try {
			fs.unlinkSync(outputPath);
			console.log(chalk.green(`Overwriting: ${outputPath}`));
		} catch (error) {
			console.error(
				chalk.red(`Failed to delete existing file: ${error.message}`),
			);
			return;
		}
	}

	// analyze the peak level with volumedetect
	const analyzeCommand = `
    ffmpeg -i "${inputPath}" -af "volumedetect" -f null /dev/null
  `;

	exec(analyzeCommand, (analyzeError, analyzeStdout, analyzeStderr) => {
		if (analyzeError) {
			console.error(
				chalk.red(
					`Error analyzing file ${file}: ${analyzeError.message}`,
				),
			);
			return;
		}

		// parse max peak level from analysis output
		const peakMatch = analyzeStderr.match(
			/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/,
		);
		if (!peakMatch) {
			console.error(
				chalk.red(`Could not determine peak volume for ${file}.`),
			);
			return;
		}

		const currentPeak = parseFloat(peakMatch[1]);
		const gainAdjustment = PEAK_TARGET - currentPeak;

		console.log(
			chalk.yellow(
				`Current peak: ${currentPeak} dB, Adjusting by: ${gainAdjustment.toFixed(
					2,
				)} dB`,
			),
		);

		// apply the gain adjustment with silence trimming
		const normalizeCommand = `
      ffmpeg -i "${inputPath}" \
      -af "silenceremove=start_periods=1:start_duration=${silenceDuration}:start_threshold=${silenceThreshold}dB,areverse,silenceremove=start_periods=1:start_duration=${silenceDuration}:start_threshold=${silenceThreshold}dB,areverse,volume=${gainAdjustment}dB" \
      "${outputPath}"
    `;

		exec(normalizeCommand, (normalizeError) => {
			if (normalizeError) {
				console.error(
					chalk.red(
						`Error normalizing file ${file}: ${normalizeError.message}`,
					),
				);
			} else {
				console.log(chalk.green(`Processed ${file} -> ${outputPath}`));
			}
		});
	});
};

// process each audio file in the input folder
fs.readdir(inputFolder, (err, files) => {
	if (err) {
		console.error(chalk.red(`Error reading input folder: ${err.message}`));
		process.exit(1);
	}

	const audioFiles = files.filter((file) => /\.(wav|mp3|flac)$/i.test(file));

	if (audioFiles.length === 0) {
		console.log(chalk.yellow('No audio files found in the input folder.'));
		return;
	}

	console.log(chalk.blue(`Processing ${audioFiles.length} audio files...`));

	audioFiles.forEach((file) => {
		const inputPath = path.join(inputFolder, file);
		const outputPath = path.join(outputFolder, file);

		processAudioFile(file, inputPath, outputPath);
	});
});
