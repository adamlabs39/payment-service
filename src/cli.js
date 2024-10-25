#!/usr/bin/env node
import { Command } from "commander";
import "dotenv/config";
import MODEL_MEREGE from "./models/model-merge.js";
import DBSeeder from "./seeders/db-seeder.js";

const program = new Command();

program
    .version('1.0.0')
    .description('Database synchronization and seeding CLI tool');

program
    .command('sync')
    .description('Synchronize the database')
    .option('-a, --alter', 'Alter existing database tables')
    .option('-f, --force', 'Force synchronization and drop tables')
    .action(async (options) => {
        try {
            console.log('Starting database synchronization...');
            console.log(`Options: alter=${options.alter}, force=${options.force}`);

            for (const model of MODEL_MEREGE) {
                console.log(`Synchronizing model: ${model.name}`);
                await model.sync({
                    alter: options.alter,
                    force: options.force,
                });
            }
            console.log('Database synchronized successfully');
        } catch (error) {
            console.error('Failed to synchronize the database:', error);
        }
    });


program
    .command('seed')
    .description('Run the database seeder')
    .action(async () => {
        try {
            await DBSeeder();
            console.log('Database seeded successfully');
        } catch (error) {
            console.error('Failed to seed the database:', error);
        }
    });

program.parse(process.argv);
process.exit(0);