#!/usr/bin/env node

const { Command } = require('commander');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const program = new Command();

program
	.version('1.0.0')
	.description('AUTOAUDIO: Trim and normalize audio files')
	.option('-i, --input <folder>', 'Input folder', './audio-input')
	.option('-o, --output <folder>', 'Output folder', './audio-output')
	.option('--gain <value>', 'Normalization gain in dB (default: 5)', '5')
	.option(
		'--trim <seconds>',
		'Seconds to trim after last sound (default: 0.5)',
		'0.5',
	)
	.parse(process.argv);

const options = program.opts();

// Create output folder if it doesn't exist
if (!fs.existsSync(options.output)) {
	fs.mkdirSync(options.output, { recursive: true });
	console.log(chalk.green(`Created output folder: ${options.output}`));
}

// Process each audio file in the input folder
fs.readdir(options.input, (err, files) => {
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
		const inputPath = path.join(options.input, file);
		const outputPath = path.join(options.output, file);

		// FFmpeg command for trimming and normalizing
		const ffmpegCommand = `
      ffmpeg -i "${inputPath}" \
      -af "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-30dB,areverse,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-30dB,areverse,volume=${options.gain}dB" \
      "${outputPath}"
    `;

		exec(ffmpegCommand, (error, stdout, stderr) => {
			if (error) {
				console.error(
					chalk.red(
						`Error processing file ${file}: ${error.message}`,
					),
				);
			} else {
				console.log(chalk.green(`Processed ${file} -> ${outputPath}`));
			}
		});
	});
});
