class CreateComments < ActiveRecord::Migration
  def change
    create_table :comments do |t|
      t.string  :body
      t.integer :topic_id
      t.string  :topic_type
      t.integer :parent_id
      t.integer :author_id

      t.timestamps
    end

    add_index :comments, :topic_id
    add_index :comments, :parent_id
    add_index :comments, :author_id

  end
end
