class CreateComments < ActiveRecord::Migration
  def change
    create_table :comments do |t|
      t.string :body
      t.integer :post_id
      t.integer :parent_id
      t.integer :author_id

      t.timestamps
    end

    add_index :comments, :post_id
    add_index :comments, :parent_id
    add_index :comments, :author_id

  end
end
