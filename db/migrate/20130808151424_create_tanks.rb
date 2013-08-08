class CreateTanks < ActiveRecord::Migration
  def change
    create_table :tanks do |t|
      t.integer :position
      t.integer :player_id
      t.integer :game_id
      t.boolean :fake

      t.timestamps
    end
  end
end
